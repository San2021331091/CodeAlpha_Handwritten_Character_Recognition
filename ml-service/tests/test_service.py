import string
import unittest

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from fastapi.testclient import TestClient

from app.main import app
from app.preprocess import decode_image, encode_png, preprocess


class PreprocessingTests(unittest.TestCase):
    def test_blank_images_rejected_for_both_polarities(self):
        for background in ("black", "white"):
            with self.assertRaisesRegex(ValueError, "No handwriting"):
                preprocess(Image.new("L", (200, 200), background))

    def test_polarity_and_translation_are_normalized(self):
        image = Image.new("L", (240, 200), "white")
        draw = ImageDraw.Draw(image)
        draw.line([(20, 30), (90, 30), (50, 135)], fill="black", width=12)
        dark, _ = preprocess(image)
        light, _ = preprocess(ImageOps.invert(image))
        self.assertEqual(dark.shape, (28, 28))
        self.assertTrue(np.allclose(dark, light))
        yy, xx = np.indices(dark.shape)
        self.assertLess(abs((xx * dark).sum() / dark.sum() - 13.5), 0.6)
        self.assertLess(abs((yy * dark).sum() / dark.sum() - 13.5), 0.6)

    def test_corrupt_and_oversize_images_rejected(self):
        with self.assertRaises(ValueError):
            decode_image("data:image/png;base64,not-base64")
        with self.assertRaises(ValueError):
            decode_image("data:image/png;base64," + "x" * 6_000_000)
        large = Image.new("L", (2001, 2000))
        with self.assertRaisesRegex(ValueError, "million"):
            decode_image(encode_png(large))

    def test_transparency_is_composited_on_white(self):
        image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        ImageDraw.Draw(image).line([(20, 20), (70, 80)], fill="black", width=10)
        pixels, _ = preprocess(decode_image(encode_png(image)))
        self.assertGreater(float(pixels.sum()), 5)


class ModelAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)

    def test_model_artifacts_and_metrics(self):
        self.assertTrue(self.client.get("/health").json()["model_loaded"])
        metrics = self.client.get("/metrics").json()
        self.assertEqual(sum(map(sum, metrics["confusion_matrix"])), 18_800)
        self.assertGreater(metrics["accuracy"], 0.85)
        self.assertEqual(metrics["train_samples"] + metrics["validation_samples"], 112_800)
        self.assertEqual(metrics["classes"], list(string.digits + string.ascii_uppercase))
        self.assertEqual(len(metrics["per_class"]), 36)
        self.assertIn("Case-insensitive", metrics["case_policy"])

    def test_all_sample_predictions_have_real_probability_distributions(self):
        samples = self.client.get("/samples").json()
        self.assertEqual(len(samples), 108)
        self.assertEqual({sample["label"] for sample in samples}, set(string.digits + string.ascii_uppercase))
        correct = 0
        for sample in samples:
            response = self.client.post("/predict", json={"image": sample["image"]})
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertAlmostEqual(sum(p["probability"] for p in result["probabilities"]), 1, places=5)
            self.assertEqual(len(result["probabilities"]), 36)
            self.assertGreater(result["latency_ms"], 0)
            correct += result["prediction"] == sample["label"]
        self.assertGreaterEqual(correct, 86, f"Only {correct}/108 normalized samples were recognized")

    def test_character_type_modes_restrict_and_renormalize_vocabulary(self):
        samples = self.client.get("/samples").json()
        letter = next(sample for sample in samples if sample["id"] == "A-0")
        digit = next(sample for sample in samples if sample["id"] == "7-0")
        for mode, sample, vocabulary in (("letters", letter, string.ascii_uppercase), ("digits", digit, string.digits)):
            response = self.client.post("/predict", json={"image": sample["image"], "mode": mode})
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual({item["label"] for item in result["probabilities"]}, set(vocabulary))
            self.assertAlmostEqual(sum(item["probability"] for item in result["probabilities"]), 1, places=5)
            self.assertEqual(result["mode"], mode)
        self.assertEqual(self.client.post("/predict", json={"image": letter["image"], "mode": "unknown"}).status_code, 422)

    def test_common_writing_styles_of_one_and_seven(self):
        # Canvas-style drawings: a flagged "1" used to read as "7", a serif "1" as "2".
        def drawing(*strokes):
            image = Image.new("RGBA", (960, 560), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            for stroke in strokes:
                draw.line(stroke, fill=(30, 34, 45, 255), width=40, joint="curve")
            return encode_png(image)

        cases = {
            "plain 1": ("1", drawing([(465, 20), (465, 400)])),
            "flagged 1": ("1", drawing([(320, 125), (465, 20), (465, 400)])),
            "serif 1": ("1", drawing([(320, 125), (465, 20), (465, 400)], [(195, 418), (690, 410)])),
            "plain 7": ("7", drawing([(250, 40), (600, 40), (380, 450)])),
            "crossed 7": ("7", drawing([(250, 40), (600, 40), (380, 450)], [(330, 240), (560, 240)])),
        }
        for name, (label, image) in cases.items():
            result = self.client.post("/predict", json={"image": image, "mode": "digits"}).json()
            self.assertEqual(result["prediction"], label, f"{name}: {result['probabilities'][:3]}")

    def test_lowercase_training_labels_map_to_alphabet_identity(self):
        from app.dataset import CLASSES, DATA_DIR, label_mapping
        mapping = label_mapping()
        for source_id, codepoint in np.loadtxt(DATA_DIR / "emnist-balanced-mapping.txt", dtype=int):
            self.assertEqual(CLASSES[mapping[source_id]], chr(codepoint).upper())

    def test_api_rejects_blank_and_malformed_images(self):
        for value in (encode_png(Image.new("L", (200, 200), "white")), "invalid"):
            self.assertEqual(self.client.post("/predict", json={"image": value}).status_code, 422)
        self.assertEqual(self.client.post("/predict", json={}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
