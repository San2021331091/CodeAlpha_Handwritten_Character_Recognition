import torch
from torch import nn


class CharacterCNN(nn.Module):
    """Spatial handwriting features with a configurable character vocabulary."""

    def __init__(self, num_classes=36):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(), nn.Linear(64 * 7 * 7, 128), nn.ReLU(),
            nn.Dropout(0.3), nn.Linear(128, num_classes),
        )

    def forward(self, x, mode="all"):
        return self.classifier(self.features(x))


class CharacterEnsemble(nn.Module):
    """Average class probabilities; return log probabilities for the API's softmax."""

    def __init__(self, members, weights, mode_weights=None):
        super().__init__()
        if not members or len(members) != len(weights):
            raise ValueError("Ensemble members and weights must match.")
        weights = torch.tensor(weights, dtype=torch.float32)
        if not torch.isfinite(weights).all() or (weights < 0).any() or weights.sum() <= 0:
            raise ValueError("Invalid ensemble weights.")
        self.members = nn.ModuleList(members)
        self.register_buffer("weights", weights / weights.sum())
        for mode, values in (mode_weights or {}).items():
            if mode not in {"all", "digits", "letters"}:
                raise ValueError("Unsupported ensemble mode.")
            values = torch.tensor(values, dtype=torch.float32)
            if len(values) != len(members) or not torch.isfinite(values).all() or (values < 0).any() or values.sum() <= 0:
                raise ValueError("Invalid mode-specific voting weights.")
            self.register_buffer(f"weights_{mode}", values / values.sum())

    def forward(self, x, mode="all"):
        weights = getattr(self, f"weights_{mode}", self.weights)
        probabilities = sum(weight * torch.softmax(member(x), dim=1) for weight, member in zip(weights, self.members) if weight > 0)
        return probabilities.clamp_min(1e-12).log()


def load_character_model(checkpoint):
    num_classes = len(checkpoint.get("classes", [str(i) for i in range(10)]))
    if "ensemble_members" in checkpoint:
        members = []
        for state in checkpoint["ensemble_members"]:
            member = CharacterCNN(num_classes)
            member.load_state_dict(state)
            members.append(member)
        return CharacterEnsemble(members, checkpoint["ensemble_weights"], checkpoint.get("ensemble_mode_weights")).eval()
    model = CharacterCNN(num_classes)
    model.load_state_dict(checkpoint["state_dict"])
    return model.eval()
