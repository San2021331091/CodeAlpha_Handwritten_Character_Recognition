import base64
import io
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 4 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 4_000_000


def encode_png(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def decode_image(value: str) -> Image.Image:
    if len(value) > MAX_BYTES * 4 // 3 + 128:
        raise ValueError("Image must be smaller than 4 MB.")
    if not value.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
        raise ValueError("Use a PNG, JPEG, or WebP image.")
    try:
        raw = base64.b64decode(value.split(",", 1)[1], validate=True)
        if len(raw) > MAX_BYTES:
            raise ValueError("Image must be smaller than 4 MB.")
        with Image.open(io.BytesIO(raw)) as source:
            if source.width * source.height > 4_000_000:
                raise ValueError("Image must contain at most 4 million pixels.")
            if source.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("Use a PNG, JPEG, or WebP image.")
            source = ImageOps.exif_transpose(source).convert("RGBA")
            background = Image.new("RGBA", source.size, "white")
            return Image.alpha_composite(background, source).convert("L")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Image could not be decoded safely.") from exc
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Invalid image: " + str(exc)) from exc


def normalize_image(image: Image.Image) -> np.ndarray:
    """Infer polarity, crop foreground, fit into 20px, center mass on 28px."""
    image = image.convert("L")
    image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    pixels = np.asarray(image, dtype=np.float32)
    border = np.concatenate((pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]))
    if np.median(border) > 127:
        pixels = 255 - pixels
    pixels = np.clip(pixels - 20, 0, 235) / 235
    ys, xs = np.where(pixels > 0.18)
    if len(xs) < 8 or pixels.max() < 0.2:
        raise ValueError("No handwriting found. Draw one character or upload a clear image.")
    crop = Image.fromarray((pixels[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255).astype(np.uint8))
    crop.thumbnail((20, 20), Image.Resampling.LANCZOS)
    canvas = Image.new("L", (28, 28))
    canvas.paste(crop, ((28 - crop.width) // 2, (28 - crop.height) // 2))
    arr = np.asarray(canvas, dtype=np.float32) / 255
    yy, xx = np.indices(arr.shape)
    mass = arr.sum()
    dx = int(round(13.5 - float((xx * arr).sum() / mass)))
    dy = int(round(13.5 - float((yy * arr).sum() / mass)))
    centered = Image.new("L", (28, 28))
    centered.paste(canvas, (dx, dy))
    return np.asarray(centered, dtype=np.float32) / 255


def preprocess(image: Image.Image) -> tuple[np.ndarray, str]:
    pixels = normalize_image(image)
    return pixels, encode_png(Image.fromarray((pixels * 255).astype(np.uint8)))
