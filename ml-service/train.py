"""Train a 36-class EMNIST CNN: 0-9 and A-Z, normalizing letter case."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import time

import numpy as np
from PIL import Image
import torch
from torch.utils.data import DataLoader, Dataset, TensorDataset

from app.augment import geometric_augment, style_augment
from app.dataset import CLASSES, DATA_DIR, SOURCE, load_split, prepare
from app.model import CharacterCNN
from app.preprocess import encode_png, normalize_image

ROOT = Path(__file__).resolve().parent
MODEL_NAME = "InkNet Character CNN"
PREPROCESS_VERSION = "upright-crop20-center28-v1"
AUGMENTATION = [
    "Style: a quarter of the '1' glyphs gain a top flag (45% of those also a base serif); 30% of '7'/'Z' glyphs gain a crossbar",
    "Geometric (half of each batch): rotation +/-8 deg, scale 0.9-1.06, shear +/-0.15, shift +/-5%",
    "Pen width: 10% dilated, 6% eroded",
]


class StyledGlyphs(Dataset):
    """Training glyphs with writing-style variants drawn on the fly."""

    def __init__(self, images, labels, seed):
        self.images, self.labels = images, labels
        self.rng = np.random.default_rng(seed)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, index):
        label = int(self.labels[index])
        image = style_augment(self.images[index], CLASSES[label], self.rng)
        return torch.from_numpy(image).unsqueeze(0).float() / 255, label


def normalized_split(split, images):
    fingerprint = hashlib.sha256((DATA_DIR / "source.json").read_bytes()).hexdigest()
    cache = DATA_DIR / f"{split}-{PREPROCESS_VERSION}-{fingerprint[:12]}.npy"
    if cache.exists():
        result = np.load(cache, allow_pickle=False)
        if result.shape == images.shape and result.dtype == np.uint8:
            return result
    result = np.empty_like(images)
    invalid = 0
    for index, image in enumerate(images):
        try:
            result[index] = np.rint(normalize_image(Image.fromarray(image)) * 255).astype(np.uint8)
        except ValueError:
            # Preserve the official test denominator even for unreadable examples.
            result[index] = 0
            invalid += 1
        if (index + 1) % 20000 == 0:
            print(f"Normalized {split}: {index + 1}/{len(images)}", flush=True)
    np.save(cache, result, allow_pickle=False)
    print(f"{split}: {invalid} blank/near-blank examples retained as zero inputs", flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=ROOT / "saved_models")
    args = parser.parse_args()
    if args.epochs < 1:
        parser.error("epochs must be positive")
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.use_deterministic_algorithms(True)
    prepare()
    raw_images, labels = load_split("train")
    raw_test, test_labels = load_split("test")
    images = normalized_split("train", raw_images)
    test_images = normalized_split("test", raw_test)
    generator = np.random.default_rng(args.seed)
    train_parts, validation_parts = [], []
    for class_id in range(len(CLASSES)):
        indices = generator.permutation(np.flatnonzero(labels == class_id))
        validation_count = len(indices) // 10
        validation_parts.append(indices[:validation_count])
        train_parts.append(indices[validation_count:])
    train_indices = generator.permutation(np.concatenate(train_parts))
    validation_indices = np.concatenate(validation_parts)

    def loader(x, y, shuffle=False):
        dataset = TensorDataset(torch.from_numpy(x).unsqueeze(1).float() / 255, torch.from_numpy(y).long())
        return DataLoader(dataset, batch_size=128, shuffle=shuffle)

    train_loader = DataLoader(StyledGlyphs(images[train_indices], labels[train_indices], args.seed), batch_size=128, shuffle=True)
    augment_generator = torch.Generator().manual_seed(args.seed)
    validation_loader = loader(images[validation_indices], labels[validation_indices])
    test_loader = loader(test_images, test_labels)
    model = CharacterCNN(len(CLASSES))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=5, gamma=0.4)
    counts = np.bincount(labels[train_indices], minlength=len(CLASSES))
    class_weights = 1.0 / counts
    class_weights /= class_weights.mean()
    criterion = torch.nn.CrossEntropyLoss(weight=torch.tensor(class_weights, dtype=torch.float32))
    best_accuracy, best_state = -1, None
    history = []
    started = time.perf_counter()
    for epoch in range(args.epochs):
        model.train()
        loss_sum, correct = 0.0, 0
        for x, y in train_loader:
            optimizer.zero_grad()
            logits = model(geometric_augment(x, augment_generator))
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            loss_sum += loss.item() * len(y)
            correct += (logits.argmax(1) == y).sum().item()
        scheduler.step()
        model.eval()
        with torch.inference_mode():
            val_correct = sum((model(x).argmax(1) == y).sum().item() for x, y in validation_loader)
        accuracy = val_correct / len(validation_indices)
        history.append({"epoch": epoch + 1, "loss": loss_sum / len(train_indices), "train_accuracy": correct / len(train_indices), "validation_accuracy": accuracy})
        print(json.dumps(history[-1]), flush=True)
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best_state = {key: value.clone() for key, value in model.state_dict().items()}
    model.load_state_dict(best_state)
    model.eval()
    confusion = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
    with torch.inference_mode():
        for x, y in test_loader:
            np.add.at(confusion, (y.numpy(), model(x).argmax(1).numpy()), 1)
    per_class = []
    for i, label in enumerate(CLASSES):
        tp = int(confusion[i, i])
        precision = tp / max(1, int(confusion[:, i].sum()))
        recall = tp / max(1, int(confusion[i].sum()))
        per_class.append({"label": label, "precision": precision, "recall": recall, "f1": 2 * precision * recall / max(1e-9, precision + recall), "support": int(confusion[i].sum())})
    metrics = {
        "model": MODEL_NAME, "dataset": "EMNIST Balanced", "classes": CLASSES,
        "case_policy": "Case-insensitive: uppercase and lowercase handwriting share an uppercase A-Z label.",
        "train_samples": len(train_indices), "validation_samples": len(validation_indices), "test_samples": len(test_images),
        "accuracy": float(confusion.trace() / confusion.sum()),
        "macro_f1": float(np.mean([item["f1"] for item in per_class])),
        "digit_accuracy": float(confusion[:10, :10].trace() / confusion[:10].sum()),
        "letter_accuracy": float(confusion[10:, 10:].trace() / confusion[10:].sum()),
        "best_validation_accuracy": best_accuracy, "epochs": args.epochs, "seed": args.seed,
        "training_seconds": round(time.perf_counter() - started, 2),
        "parameters": sum(parameter.numel() for parameter in model.parameters()),
        "history": history, "per_class": per_class, "confusion_matrix": confusion.tolist(),
        "architecture": ["Input: 1 x 28 x 28", "Conv2D: 32 filters, 3 x 3, ReLU", "MaxPool: 2 x 2", "Conv2D: 64 filters, 3 x 3, ReLU", "MaxPool: 2 x 2", "Dense: 128, ReLU, Dropout 0.3", "Dense: 36 logits -> Softmax"],
        "scope": "Single English letters A-Z and digits 0-9. Lowercase is normalized to uppercase. Words, sentences, punctuation and other scripts are outside the label set. Scores are uncalibrated.",
        "preprocessing": PREPROCESS_VERSION, "augmentation": AUGMENTATION, "dataset_source": SOURCE,
        "source_sha256": json.loads((DATA_DIR / "source.json").read_text(encoding="utf-8"))["sha256"],
        "class_counts_training": dict(zip(CLASSES, counts.tolist())),
    }
    args.output.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": best_state, "seed": args.seed, "classes": CLASSES, "preprocessing": PREPROCESS_VERSION, "augmentation": AUGMENTATION}, args.output / "model.tmp")
    (args.output / "model.tmp").replace(args.output / "model.pt")
    (args.output / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    samples = []
    for class_id, label in enumerate(CLASSES):
        # Fixed examples, independent of model predictions (no cherry-picking).
        for variant, index in enumerate(np.flatnonzero(test_labels == class_id)[:3]):
            samples.append({"id": f"{label}-{variant}", "label": label, "image": encode_png(Image.fromarray(255 - raw_test[index])), "source": "EMNIST Balanced official test split"})
    (args.output / "samples.json").write_text(json.dumps(samples), encoding="utf-8")
    print(f"Saved {args.output}; test accuracy={metrics['accuracy']:.4%}; letters={metrics['letter_accuracy']:.4%}; digits={metrics['digit_accuracy']:.4%}", flush=True)


if __name__ == "__main__":
    main()
