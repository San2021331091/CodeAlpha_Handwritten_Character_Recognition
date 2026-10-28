import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import time
from typing import Literal
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from .model import load_character_model
from .decision import describe_decision
from .preprocess import decode_image, preprocess

ARTIFACTS = Path(os.environ.get("MODEL_DIR", str(Path(__file__).resolve().parents[1] / "saved_models")))
model = None
metrics = None
samples = []
classes = []
inference_lock = asyncio.Semaphore(2)


@asynccontextmanager
async def lifespan(app):
    global model, metrics, samples, classes
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    if (ARTIFACTS / "model.pt").exists():
        checkpoint = torch.load(ARTIFACTS / "model.pt", map_location="cpu", weights_only=True)
        classes = checkpoint.get("classes", [str(i) for i in range(10)])
        candidate = load_character_model(checkpoint)
        candidate.eval()
        metrics = json.loads((ARTIFACTS / "metrics.json").read_text(encoding="utf-8"))
        if classes != metrics["classes"]:
            raise RuntimeError("Model vocabulary does not match evaluation metadata.")
        samples = json.loads((ARTIFACTS / "samples.json").read_text(encoding="utf-8"))
        model = candidate
    yield


app = FastAPI(title="InkLab · Handwritten Character Recognition", version="1.0.0", lifespan=lifespan)


class PredictionRequest(BaseModel):
    image: str = Field(min_length=1, max_length=5_592_536)
    mode: Literal["all", "letters", "digits"] = "all"


def require_model():
    if model is None:
        raise HTTPException(503, "Model unavailable. Run python train.py and restart the ML service.")


@app.get("/health")
def health():
    return {"status": "ready" if model is not None else "untrained", "model_loaded": model is not None, "service": "inklab-ml", "classes": classes}


@app.get("/metrics")
def get_metrics():
    require_model()
    return metrics


@app.get("/samples")
def get_samples():
    require_model()
    return samples


def infer(image, mode="all"):
    started = time.perf_counter()
    try:
        pixels, preview = preprocess(decode_image(image))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    with torch.inference_mode():
        logits = model(torch.from_numpy(pixels.copy())[None, None], mode=mode)[0]
        allowed = [i for i, label in enumerate(classes) if mode == "all" or (mode == "letters" and label.isalpha()) or (mode == "digits" and label.isdigit())]
        if not allowed:
            raise HTTPException(503, "This checkpoint does not support the selected character type. Train the EMNIST model.")
        probabilities = torch.softmax(logits[allowed], dim=0).numpy()
    ranking = sorted([{"label": classes[index], "probability": float(probability)} for index, probability in zip(allowed, probabilities)], key=lambda item: item["probability"], reverse=True)
    return {"prediction": ranking[0]["label"], "confidence": ranking[0]["probability"], "probabilities": ranking,
            "processed_image": preview, "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "model": metrics["model"], "mode": mode, **describe_decision(ranking, pixels, mode),
            "warning": "Single English letters and digits only. Letter case is normalized to uppercase. Scores are uncalibrated and conditional on the selected character type."}


@app.post("/predict")
async def predict(body: PredictionRequest):
    require_model()
    async with inference_lock:
        return await run_in_threadpool(infer, body.image, body.mode)
