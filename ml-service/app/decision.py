"""Expose ambiguous glyphs instead of inventing certainty about their intended type."""
import numpy as np


def describe_decision(ranking, pixels, mode):
    top = ranking[0]
    runner_up = ranking[1]["probability"] if len(ranking) > 1 else 0.0
    uncertain = top["probability"] < 0.7 or top["probability"] - runner_up < 0.15
    result = {"uncertain": uncertain, "ambiguous_labels": [], "ambiguity_reason": None, "requires_type_choice": False}
    if mode != "all":
        if uncertain:
            result["ambiguous_labels"] = [item["label"] for item in ranking[:3] if item["probability"] >= 0.1]
            result["ambiguity_reason"] = "The model cannot separate these candidates reliably. Try a clearer single character."
        return result
    scores = {item["label"]: item["probability"] for item in ranking}
    ys, xs = np.where(pixels > 0.18)
    narrow_stroke = len(xs) > 0 and (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1) < 0.28
    family = ("1", "I", "L")
    if narrow_stroke and top["label"] in family:
        result.update(uncertain=True, ambiguous_labels=list(family), requires_type_choice=True,
                      ambiguity_reason="A plain vertical stroke can be the digit 1, uppercase I, or lowercase l (displayed as L). Choose a character type or add a distinctive flag or serif.")
        return result
    for family in (("1", "I", "L"), ("0", "O"), ("2", "Z"), ("5", "S"), ("8", "B"), ("6", "G")):
        plausible = [label for label in family if scores.get(label, 0) >= 0.12]
        if uncertain and top["label"] in family and len(plausible) >= 2:
            result.update(ambiguous_labels=plausible, requires_type_choice=True,
                          ambiguity_reason="This shape has plausible letter and digit interpretations. Choose digits or letters to narrow the vocabulary.")
            return result
    if uncertain:
        result["ambiguous_labels"] = [item["label"] for item in ranking[:3] if item["probability"] >= 0.1]
        result["ambiguity_reason"] = "Several characters have similar model scores. Try a clearer single character."
    return result
