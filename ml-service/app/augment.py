"""Training-time augmentation for normalized 28 x 28 glyphs (white ink on black).

EMNIST was written by US census staff, so its "1" is almost always a single
vertical stroke. A flagged "1" then reads as "7" and a flag plus base serif as
"2". Style augmentation draws those common writing variants onto real EMNIST
glyphs; geometric augmentation covers slant, size and pen-width differences
between the dataset and canvas drawings or photos.
"""
import math

import numpy as np
from PIL import Image, ImageDraw
import torch
import torch.nn.functional as F

from .preprocess import normalize_image

SCALE = 4


def _ink_row(ink, y):
    xs = np.flatnonzero(ink[y])
    return float(xs.mean()) if len(xs) else None


def _stroke_geometry(image):
    """Upscale a glyph and return (canvas, ink mask, top y, bottom y, stroke width)."""
    big = Image.fromarray(image).resize((28 * SCALE, 28 * SCALE), Image.Resampling.BILINEAR)
    ink = np.asarray(big) > 96
    rows = np.flatnonzero(ink.any(axis=1))
    if len(rows) < 8:
        return None
    top, bottom = int(rows[0]), int(rows[-1])
    # A mostly vertical stroke covers about width * height pixels.
    width = max(SCALE, int(round(ink.sum() / (bottom - top + 1))))
    return big, ink, top, bottom, min(width, 4 * SCALE)


def _line(draw, start, end, width):
    draw.line([start, end], fill=255, width=width)
    for x, y in (start, end):
        draw.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=255)


def add_one_style(image, rng):
    """Add a flag at the top of a "1" and, sometimes, a horizontal base serif."""
    geometry = _stroke_geometry(image)
    if geometry is None:
        return image
    big, ink, top, bottom, width = geometry
    height = bottom - top
    top_x, bottom_x = _ink_row(ink, top + width // 2), _ink_row(ink, bottom - width // 2)
    if top_x is None or bottom_x is None:
        return image
    band = np.flatnonzero(ink[top:top + 2 * width].any(axis=0))
    if band[-1] - band[0] > 2.5 * width:
        return image  # this "1" already has a flag
    # Measure the flag from the stroke's own direction so slanted strokes get a
    # visible flag instead of one drawn along the stroke.
    stroke = math.atan2(height, bottom_x - top_x)
    # A near-horizontal flag is the top bar of a "7", so keep it >= 25 degrees down.
    angle = min(stroke + math.radians(rng.uniform(35, 70)), math.radians(155))
    length = height * rng.uniform(0.22, 0.36)
    draw = ImageDraw.Draw(big)
    start = (top_x, top + width / 2)
    _line(draw, start, (start[0] + length * math.cos(angle), start[1] + length * math.sin(angle)), width)
    if rng.random() < 0.45:
        half = height * rng.uniform(0.16, 0.3)
        tilt = height * rng.uniform(-0.03, 0.03)
        y = bottom - width / 2
        _line(draw, (bottom_x - half, y - tilt), (bottom_x + half * rng.uniform(0.8, 1.2), y + tilt), width)
    return _renormalize(big, image)


def add_crossbar(image, rng):
    """Cross the middle of a glyph, as in a European "7" or "Z"."""
    geometry = _stroke_geometry(image)
    if geometry is None:
        return image
    big, ink, top, bottom, width = geometry
    y = int(top + (bottom - top) * rng.uniform(0.45, 0.6))
    x = _ink_row(ink, y)
    if x is None:
        return image
    half = (bottom - top) * rng.uniform(0.14, 0.24)
    _line(ImageDraw.Draw(big), (x - half, y), (x + half, y + rng.uniform(-2, 2) * SCALE), width)
    return _renormalize(big, image)


def _renormalize(big, fallback):
    # Extra strokes change the bounding box, so re-run the inference normalization.
    try:
        return np.rint(normalize_image(big.resize((28, 28), Image.Resampling.LANCZOS)) * 255).astype(np.uint8)
    except ValueError:
        return fallback


def style_augment(image, label, rng):
    if label == "1" and rng.random() < 0.25:
        return add_one_style(image, rng)
    if label in ("7", "Z") and rng.random() < 0.3:
        return add_crossbar(image, rng)
    return image


def geometric_augment(x, generator):
    """Random rotation, scale, shear, shift and pen width for half of a (B, 1, 28, 28) batch.

    The other half stays untouched so the small CNN still fits clean glyphs.
    """
    b = x.shape[0]

    def uniform(low, high):
        return torch.rand(b, generator=generator) * (high - low) + low

    angle = uniform(-1, 1) * math.radians(8)
    scale = uniform(0.9, 1.06)
    shear = uniform(-0.15, 0.15)
    theta = torch.zeros(b, 2, 3)
    theta[:, 0, 0] = torch.cos(angle) / scale
    theta[:, 0, 1] = (-torch.sin(angle) + shear) / scale
    theta[:, 1, 0] = torch.sin(angle) / scale
    theta[:, 1, 1] = torch.cos(angle) / scale
    theta[:, 0, 2] = uniform(-0.05, 0.05)
    theta[:, 1, 2] = uniform(-0.05, 0.05)
    grid = F.affine_grid(theta, list(x.shape), align_corners=False)
    warped = F.grid_sample(x, grid, padding_mode="zeros", align_corners=False)
    x = torch.where((torch.rand(b, generator=generator) < 0.5).view(b, 1, 1, 1), warped, x)
    pen = torch.rand(b, generator=generator).view(b, 1, 1, 1)
    thick = F.max_pool2d(x, 3, stride=1, padding=1)
    thin = F.pad(-F.max_pool2d(-x, 2, stride=1), (0, 1, 0, 1))
    # Only thin glyphs that keep most of their ink.
    keep = (thin.flatten(1).sum(1) > 0.4 * x.flatten(1).sum(1)).view(b, 1, 1, 1)
    x = torch.where(pen < 0.1, thick, x)
    return torch.where((pen >= 0.1) & (pen < 0.16) & keep, thin, x)
