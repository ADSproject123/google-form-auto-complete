"""Tests for SVG generation: embedded raster SVG and vectorization."""

import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import MissingDependencyError, convert_image


class TestSVGConversion(unittest.TestCase):
    """Test SVG generation strategies and dependency detection."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="svg_test_")
        self.png_path = Path(self.temp_dir) / "test_icon.png"
        self.jpg_path = Path(self.temp_dir) / "test_photo.jpg"

        rgba = Image.new("RGBA", (48, 48), color=(255, 100, 50, 200))
        rgba.save(self.png_path, format="PNG")

        rgb = Image.new("RGB", (60, 40), color=(10, 80, 160))
        rgb.save(self.jpg_path, format="JPEG")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_png_to_embedded_svg(self):
        res = convert_image(self.png_path, "svg")
        self.assertTrue(res.success)
        self.assertEqual(res.output_format, "SVG")
        self.assertTrue(Path(res.output_path).exists())

        content = Path(res.output_path).read_text(encoding="utf-8")
        self.assertIn("<svg", content)
        self.assertIn('width="48"', content)
        self.assertIn('height="48"', content)
        self.assertIn("<image", content)
        self.assertIn("data:image/png;base64,", content)
        self.assertTrue(any("embedded raster SVG" in w for w in res.warnings))

    def test_jpeg_to_embedded_svg(self):
        res = convert_image(self.jpg_path, "svg")
        self.assertTrue(res.success)
        self.assertEqual(res.output_format, "SVG")

        content = Path(res.output_path).read_text(encoding="utf-8")
        self.assertIn("<svg", content)
        self.assertIn('width="60"', content)
        self.assertIn('height="40"', content)
        self.assertIn("data:image/jpeg;base64,", content)

    def test_vectorize_without_potrace_raises_missing_dependency(self):
        with self.assertRaises(MissingDependencyError) as ctx:
            convert_image(self.png_path, "svg", vectorize=True)

        err_msg = str(ctx.exception)
        self.assertIn("vectorization requires a vector tracing utility", err_msg)
        self.assertIn("potrace", err_msg)


if __name__ == "__main__":
    unittest.main()

