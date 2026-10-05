"""Tests for batch image conversion functionality."""

import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import (
    InvalidImageError,
    convert_images,
)


class TestBatchConversion(unittest.TestCase):
    """Test batch conversion with convert_images."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="batch_test_")
        self.input_dir = Path(self.temp_dir) / "inputs"
        self.output_dir = Path(self.temp_dir) / "outputs"
        self.input_dir.mkdir()
        self.output_dir.mkdir()

        self.files = []
        for i in range(3):
            p = self.input_dir / f"img_{i}.png"
            img = Image.new("RGB", (32, 32), color=(i * 40, i * 60, i * 80))
            img.save(p, format="PNG")
            self.files.append(p)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_batch_convert_all_succeed(self):
        batch = convert_images(self.files, "webp", output_directory=self.output_dir)
        self.assertEqual(batch.total, 3)
        self.assertEqual(batch.succeeded, 3)
        self.assertEqual(batch.failed, 0)
        self.assertEqual(len(batch), 3)

        for res in batch:
            self.assertTrue(res.success)
            self.assertEqual(res.output_format, "WEBP")
            self.assertTrue(Path(res.output_path).exists())

    def test_batch_convert_partial_failure_with_fail_fast_false(self):
        broken = self.input_dir / "broken.jpg"
        broken.write_bytes(b"invalid data")
        mixed = self.files + [broken]

        batch = convert_images(
            mixed, "webp", output_directory=self.output_dir, fail_fast=False
        )
        self.assertEqual(batch.total, 4)
        self.assertEqual(batch.succeeded, 3)
        self.assertEqual(batch.failed, 1)
        self.assertEqual(len(batch.errors), 1)
        self.assertEqual(batch.errors[0]["input_path"], str(broken))

    def test_batch_convert_raises_immediately_with_fail_fast_true(self):
        broken = self.input_dir / "broken.jpg"
        broken.write_bytes(b"invalid data")
        mixed = [broken] + self.files

        with self.assertRaises(InvalidImageError):
            convert_images(
                mixed, "webp", output_directory=self.output_dir, fail_fast=True
            )

    def test_empty_batch(self):
        batch = convert_images([], "webp")
        self.assertEqual(batch.total, 0)
        self.assertEqual(batch.succeeded, 0)
        self.assertEqual(batch.failed, 0)


if __name__ == "__main__":
    unittest.main()

