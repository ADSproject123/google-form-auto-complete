"""Tests for security controls: path validation, bomb protection, and atomic files."""

import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import (
    InvalidImageError,
    SecurityError,
    ValidationError,
    convert_image,
)


class TestSecurity(unittest.TestCase):
    """Test security mechanisms against malicious input, bombs, and directory traversal."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="sec_test_")
        self.img_path = Path(self.temp_dir) / "valid.png"
        img = Image.new("RGB", (100, 100), color=(10, 20, 30))
        img.save(self.img_path, format="PNG")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_nonexistent_file_raises_invalid_image_error(self):
        missing = Path(self.temp_dir) / "does_not_exist.png"
        with self.assertRaises(InvalidImageError):
            convert_image(str(missing), "jpeg")

    def test_empty_path_raises_validation_error(self):
        with self.assertRaises(ValidationError):
            convert_image("", "jpeg")

    def test_max_dimensions_limit_enforced(self):
        with self.assertRaises(SecurityError) as ctx:
            convert_image(self.img_path, "jpeg", max_dimensions=(50, 50))
        self.assertIn("dimensions_limit", str(ctx.exception.details.get("violation_type")))

    def test_max_file_size_limit_enforced(self):
        with self.assertRaises(SecurityError) as ctx:
            convert_image(self.img_path, "jpeg", max_file_size_bytes=10)
        self.assertIn("file_size_limit", str(ctx.exception.details.get("violation_type")))

    def test_corrupted_image_raises_invalid_image_error(self):
        corrupt_path = Path(self.temp_dir) / "corrupt.png"
        corrupt_path.write_bytes(b"NOT_A_VALID_IMAGE_FILE_DATA_1234567890")
        with self.assertRaises(InvalidImageError):
            convert_image(str(corrupt_path), "jpeg")

    def test_atomic_file_no_leftover_temp_on_failure(self):
        out_path = Path(self.temp_dir) / "output.dds"
        corrupt_path = Path(self.temp_dir) / "broken.jpg"
        corrupt_path.write_bytes(b"broken content")
        with self.assertRaises(InvalidImageError):
            convert_image(str(corrupt_path), "png", output_path=out_path)

        after_files = set(Path(self.temp_dir).iterdir())
        tmp_files = [f for f in after_files if f.name.startswith(".tmp_")]
        self.assertEqual(len(tmp_files), 0)
        self.assertFalse(out_path.exists())


if __name__ == "__main__":
    unittest.main()

