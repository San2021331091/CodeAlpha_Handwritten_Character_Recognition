"""Read the official EMNIST Balanced IDX data with explicit label/orientation handling."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import string
import struct
import urllib.request
import zipfile

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://biometrics.nist.gov/cs_links/EMNIST/gzip.zip"
CLASSES = list(string.digits + string.ascii_uppercase)
DATA_DIR = ROOT / "data" / "emnist-balanced"


class RemoteZip(io.RawIOBase):
    """Seekable HTTP Range reader: retrieve only the selected official ZIP members."""

    def __init__(self, url):
        self.url = url
        self.position = 0
        request = urllib.request.Request(url, headers={"Range": "bytes=0-0", "User-Agent": "InkLab/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            content_range = response.headers.get("Content-Range", "")
            match = re.fullmatch(r"bytes 0-0/(\d+)", content_range)
            if response.status != 206 or not match:
                raise RuntimeError("EMNIST server must support byte ranges; use a local data folder instead.")
            self.length = int(match[1])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        self.position = offset + (self.position if whence == io.SEEK_CUR else self.length if whence == io.SEEK_END else 0)
        if self.position < 0:
            raise ValueError("Negative seek")
        return self.position

    def read(self, size=-1):
        end = self.length if size < 0 else min(self.length, self.position + size)
        if end <= self.position:
            return b""
        start = self.position
        request = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end - 1}", "User-Agent": "InkLab/1.0"})
        with urllib.request.urlopen(request, timeout=180) as response:
            expected = f"bytes {start}-{end - 1}/{self.length}"
            if response.status != 206 or response.headers.get("Content-Range") != expected:
                raise RuntimeError("Invalid range response from the EMNIST dataset server.")
            content = response.read()
        if len(content) != end - start:
            raise RuntimeError("Incomplete EMNIST download. Retry preparation.")
        self.position = end
        return content


def prepare():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    files = [f"emnist-balanced-{split}-{kind}-ubyte.gz" for split in ("train", "test") for kind in ("images-idx3", "labels-idx1")]
    files.append("emnist-balanced-mapping.txt")
    manifest_path = DATA_DIR / "source.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("url") == SOURCE and all((DATA_DIR / name).exists() and hashlib.sha256((DATA_DIR / name).read_bytes()).hexdigest() == manifest.get("sha256", {}).get(name) for name in files):
            return
    manifest = {"url": SOURCE, "sha256": {}, "zip_crc32": {}}
    with RemoteZip(SOURCE) as remote, zipfile.ZipFile(remote) as archive:
        for name in files:
            member = next(item for item in archive.infolist() if item.filename.rsplit("/", 1)[-1] == name)
            print(f"Downloading {name} ({member.file_size / 1024**2:.1f} MB)", flush=True)
            content = archive.read(member)  # zipfile verifies each member's CRC32.
            path = DATA_DIR / name
            temporary = path.with_suffix(path.suffix + ".part")
            temporary.write_bytes(content)
            temporary.replace(path)
            manifest["sha256"][name] = hashlib.sha256(content).hexdigest()
            manifest["zip_crc32"][name] = member.CRC
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def label_mapping():
    pairs = np.loadtxt(DATA_DIR / "emnist-balanced-mapping.txt", dtype=int)
    # EMNIST Balanced has 47 classes, including 11 distinct lowercase forms.
    # Normalize both letter cases to their alphabet identity (36 output classes).
    mapping = np.array([CLASSES.index(chr(code).upper()) for _, code in pairs], dtype=np.int64)
    if not np.array_equal(pairs[:, 0], np.arange(47)) or set(mapping) != set(range(36)):
        raise ValueError("Unexpected EMNIST label mapping.")
    return mapping


def load_split(split):
    prefix = DATA_DIR / f"emnist-balanced-{split}"
    images_raw = gzip.decompress(Path(str(prefix) + "-images-idx3-ubyte.gz").read_bytes())
    labels_raw = gzip.decompress(Path(str(prefix) + "-labels-idx1-ubyte.gz").read_bytes())
    magic, count, rows, columns = struct.unpack(">IIII", images_raw[:16])
    label_magic, label_count = struct.unpack(">II", labels_raw[:8])
    if (magic, label_magic, rows, columns) != (2051, 2049, 28, 28) or count != label_count:
        raise ValueError("Invalid EMNIST IDX headers.")
    # Stored EMNIST pixels are transposed relative to upright handwriting.
    images = np.frombuffer(images_raw[16:], dtype=np.uint8).reshape(count, 28, 28).transpose(0, 2, 1).copy()
    raw_labels = np.frombuffer(labels_raw[8:], dtype=np.uint8)
    labels = label_mapping()[raw_labels]
    return images, labels


if __name__ == "__main__":
    prepare()
    for split in ("train", "test"):
        images, labels = load_split(split)
        print(f"{split}: {len(images)} images; {len(set(labels))} output classes", flush=True)
