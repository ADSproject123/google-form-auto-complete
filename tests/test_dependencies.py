"""Tests for runtime dependency detection and informative error messages."""

import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import (
    MissingDependencyError,
    convert_image,
)
from image_converter.cli import check_system_dependencies


class TestDependencies(unittest.TestCase):
    """Test runtime detection of optional external backends and codecs."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="dep_test_")
        self.img_path = Path(self.temp_dir) / "source.png"
        img = Image.new("RGB", (32, 32), color=(100, 150, 200))
        img.save(self.img_path, format="PNG")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_psd_requires_imagemagick_when_missing(self):
        if not shutil.which("magick") and not shutil.which("convert"):
            with self.assertRaises(MissingDependencyError) as ctx:
                convert_image(self.img_path, "psd")
            self.assertEqual(ctx.exception.format_name, "PSD")
            self.assertIn("ImageMagick", str(ctx.exception))
            self.assertIsNotNone(ctx.exception.installation_instructions)

    def test_heic_codec_error_message(self):
        if not shutil.which("magick") and not shutil.which("convert"):
            with self.assertRaises(MissingDependencyError) as ctx:
                convert_image(self.img_path, "heic")
            self.assertIn("HEIC/HEIF conversion is unavailable", str(ctx.exception))
            self.assertIn("pillow-heif", ctx.exception.installation_instructions)

    def test_avif_codec_error_message(self):
        from PIL import features
        if not features.check("avif") and not shutil.which("magick"):
            with self.assertRaises(MissingDependencyError) as ctx:
                convert_image(self.img_path, "avif")
            self.assertIn("AVIF conversion is unavailable", str(ctx.exception))

    def test_exr_codec_error_message(self):
        if not shutil.which("magick") and not shutil.which("convert"):
            with self.assertRaises(MissingDependencyError) as ctx:
                convert_image(self.img_path, "exr")
            self.assertIn("OpenEXR", str(ctx.exception))

    def test_check_system_dependencies_dictionary(self):
        deps = check_system_dependencies()
        self.assertIn("pillow", deps)
        self.assertIn("imagemagick", deps)
        self.assertIn("ghostscript", deps)
        self.assertIn("potrace", deps)
        self.assertTrue(deps["pillow"]["installed"])


if __name__ == "__main__":
    unittest.main()

