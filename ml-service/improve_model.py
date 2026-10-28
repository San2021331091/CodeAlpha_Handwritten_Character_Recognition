"""Select an augmented-model ensemble on validation; test only the selected candidate."""
import argparse
import copy
import json
from pathlib import Path

import numpy as np
import torch

from app.dataset import CLASSES, DATA_DIR, load_split
from app.model import load_character_model

ROOT = Path(__file__).resolve().parent


def probabilities(model, images):
    batches = []
    with torch.inference_mode():
        for offset in range(0, len(images), 256):
            batch = torch.from_numpy(images[offset:offset + 256]).unsqueeze(1).float() / 255
            batches.append(torch.softmax(model(batch), 1).numpy())
    return np.concatenate(batches)


def summarize(probability, labels):
    predictions = probability.argmax(1)
    confusion = np.zeros((36, 36), dtype=int)
    np.add.at(confusion, (labels, predictions), 1)
    precision = np.diag(confusion) / np.maximum(confusion.sum(0), 1)
    recall = np.diag(confusion) / np.maximum(confusion.sum(1), 1)
    f1 = 2 * precision * recall / np.maximum(precision + recall, 1e-12)
    return {"accuracy": float((predictions == labels).mean()), "macro_f1": float(f1.mean()),
            "one_recall": float(recall[1]),
            "digit_mode_accuracy": float((probability[labels < 10, :10].argmax(1) == labels[labels < 10]).mean()),
            "letter_accuracy": float((predictions[labels >= 10] == labels[labels >= 10]).mean()),
            "confusion": confusion, "precision": precision, "recall": recall, "f1": f1}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, default=ROOT / "saved_models")
    parser.add_argument("--output", type=Path, default=ROOT / "saved_models_improved")
    args = parser.parse_args()
    torch.set_num_threads(4)
    baseline_metrics = json.loads((args.baseline / "metrics.json").read_text(encoding="utf-8"))
    candidate_metrics = json.loads((args.candidate / "metrics.json").read_text(encoding="utf-8"))
    for key in ("classes", "seed", "preprocessing", "source_sha256", "train_samples", "validation_samples"):
        if baseline_metrics[key] != candidate_metrics[key]:
            raise ValueError(f"Candidates do not share the same validation split/preprocessing: {key}")
    checkpoints = [torch.load(directory / "model.pt", map_location="cpu", weights_only=True) for directory in (args.baseline, args.candidate)]
    if any("ensemble_members" in checkpoint for checkpoint in checkpoints):
        raise ValueError("Compare two single-model candidates, not an already selected ensemble.")
    models = [load_character_model(checkpoint) for checkpoint in checkpoints]
    _, labels = load_split("train")
    generator = np.random.default_rng(baseline_metrics["seed"])
    validation_indices = np.concatenate([generator.permutation(np.flatnonzero(labels == i))[:int((labels == i).sum()) // 10] for i in range(36)])
    images = np.load(next(DATA_DIR.glob("train-upright-crop20-center28-v1-*.npy")), allow_pickle=False)
    validation_labels = labels[validation_indices]
    probs = [probabilities(model, images[validation_indices]) for model in models]
    base = summarize(probs[0], validation_labels)
    trials = []
    best, best_weight = base, 0.0
    for weight in (0.0, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.5, 0.75, 1.0):
        result = summarize((1 - weight) * probs[0] + weight * probs[1], validation_labels)
        eligible = result["one_recall"] >= base["one_recall"] and result["digit_mode_accuracy"] >= base["digit_mode_accuracy"] - 0.002
        trial = {key: result[key] for key in ("accuracy", "macro_f1", "one_recall", "digit_mode_accuracy", "letter_accuracy")}
        trial.update(candidate_weight=weight, eligible=eligible)
        trials.append(trial)
        print(json.dumps(trial), flush=True)
        if eligible and (result["accuracy"], result["macro_f1"]) > (best["accuracy"], best["macro_f1"]):
            best, best_weight = result, weight
    args.output.mkdir(parents=True, exist_ok=True)
    mode_weights = {"all": [1 - best_weight, best_weight]}
    mode_trials = {}
    for mode, indices in (("digits", np.arange(10)), ("letters", np.arange(10, 36))):
        mask = np.isin(validation_labels, indices)
        values = []
        for weight in (0.0, 0.25, 0.5, 0.75, 1.0):
            mixed = (1 - weight) * probs[0][mask] + weight * probs[1][mask]
            constrained = np.zeros_like(mixed)
            constrained[:, indices] = mixed[:, indices]
            constrained /= constrained.sum(1, keepdims=True)
            result = summarize(constrained, validation_labels[mask])
            values.append({"candidate_weight": weight, "accuracy": result["accuracy"], "macro_f1": float(result["f1"][indices].mean())})
        selected = max(values, key=lambda item: (item["accuracy"], item["macro_f1"]))
        mode_trials[mode] = values
        mode_weights[mode] = [1 - selected["candidate_weight"], selected["candidate_weight"]]
        print(json.dumps({"mode": mode, "selected": selected}), flush=True)
    accepted = any(weights[1] > 0 for weights in mode_weights.values())
    report = {"selection_partition": "Original stratified EMNIST validation split only", "validation_samples": len(validation_indices),
              "test_used_for_selection": False, "trials": trials, "selected_candidate_weight": best_weight,
              "mode_trials": mode_trials, "mode_weights": mode_weights, "accepted": accepted}
    if not accepted:
        (args.output / "selection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("Retained baseline; no validated improvement satisfied the regression guards.", flush=True)
        return
    # The official test set is first used after the voting weight is fixed.
    test_images = np.load(next(DATA_DIR.glob("test-upright-crop20-center28-v1-*.npy")), allow_pickle=False)
    _, test_labels = load_split("test")
    test_probs = [probabilities(model, test_images) for model in models]
    test = summarize((1 - best_weight) * test_probs[0] + best_weight * test_probs[1], test_labels)
    confusion = test["confusion"]
    metrics = copy.deepcopy(baseline_metrics)
    members = [i for i in range(2) if any(weights[i] > 0 for weights in mode_weights.values())]
    conditional_results = {}
    for mode, indices in (("digits", np.arange(10)), ("letters", np.arange(10, 36))):
        mask = np.isin(test_labels, indices)
        weights = mode_weights[mode]
        mixed = weights[0] * test_probs[0][mask] + weights[1] * test_probs[1][mask]
        conditional_results[mode] = float((indices[mixed[:, indices].argmax(1)] == test_labels[mask]).mean())
    metrics.update(model="Context-aware InkNet",
                   accuracy=test["accuracy"], macro_f1=test["macro_f1"], best_validation_accuracy=best["accuracy"],
                   digit_accuracy=float(confusion[:10, :10].trace() / confusion[:10].sum()),
                   letter_accuracy=test["letter_accuracy"], confusion_matrix=confusion.tolist(),
                   parameters=baseline_metrics["parameters"] * len(members),
                   training_seconds=sum((baseline_metrics, candidate_metrics)[i]["training_seconds"] for i in members),
                   epochs=sum((baseline_metrics, candidate_metrics)[i]["epochs"] for i in members),
                   training_note="Learning curve shows the original member. Separate voting weights for mixed, digits-only and letters-only modes were selected on validation data. Mixed mode retains the original model when digit-1 recall would regress.",
                   ensemble_weights=[(1 - best_weight, best_weight)[i] for i in members],
                   validation_selection=report,
                   digit_mode_accuracy=conditional_results["digits"], letter_mode_accuracy=conditional_results["letters"],
                   ensemble_mode_weights={mode: [weights[i] for i in members] for mode, weights in mode_weights.items()},
                   architecture=[f"{len(members)} CNN member(s): Conv32/Conv64/Dense128", "Original and style/geometric-augmented handwriting", "Validation-selected probability averaging", "36 character probabilities"],
                   per_class=[{"label": label, "precision": float(test["precision"][i]), "recall": float(test["recall"][i]),
                               "f1": float(test["f1"][i]), "support": int(confusion[i].sum())} for i, label in enumerate(CLASSES)])
    checkpoint = {"classes": CLASSES, "seed": baseline_metrics["seed"], "preprocessing": baseline_metrics["preprocessing"],
                  "ensemble_members": [checkpoints[i]["state_dict"] for i in members], "ensemble_weights": metrics["ensemble_weights"],
                  "ensemble_mode_weights": metrics["ensemble_mode_weights"]}
    torch.save(checkpoint, args.output / "model.pt")
    (args.output / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (args.output / "samples.json").write_bytes((args.baseline / "samples.json").read_bytes())
    (args.output / "selection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"accepted": True, "validation_accuracy": best["accuracy"], "test_accuracy": test["accuracy"], "test_macro_f1": test["macro_f1"]}), flush=True)


if __name__ == "__main__":
    main()
