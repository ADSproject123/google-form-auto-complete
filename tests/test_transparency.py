"""Tests for transparency preservation and configurable background flattening."""

import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import convert_image


class TestTransparency(unittest.TestCase):
    """Test handling of alpha channels and flattening onto backgrounds."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="trans_test_")
        self.rgba_path = Path(self.temp_dir) / "transparent.png"

        img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        for y in range(16, 32):
            for x in range(32):
                img.putpixel((x, y), (255, 0, 0, 255))
        img.save(self.rgba_path, format="PNG")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_transparency_preserved_in_png_and_webp(self):
        for fmt in ("png", "webp", "tiff"):
            res = convert_image(self.rgba_path, fmt)
            self.assertTrue(res.success)
            self.assertTrue(res.has_transparency)

            with Image.open(res.output_path) as out:
                top_pixel = out.convert("RGBA").getpixel((0, 0))
                self.assertEqual(top_pixel[3], 0)
                bot_pixel = out.convert("RGBA").getpixel((0, 20))
                self.assertEqual(bot_pixel[0], 255)
                self.assertEqual(bot_pixel[3], 255)

    def test_transparency_flattened_to_jpeg_default_white(self):
        res = convert_image(self.rgba_path, "jpeg")
        self.assertTrue(res.success)
        self.assertFalse(res.has_transparency)

        with Image.open(res.output_path) as out:
            self.assertEqual(out.mode, "RGB")
            top_pixel = out.getpixel((0, 0))
            self.assertGreaterEqual(top_pixel[0], 240)
            self.assertGreaterEqual(top_pixel[1], 240)
            self.assertGreaterEqual(top_pixel[2], 240)

    def test_transparency_flattened_to_jpeg_custom_blue_background(self):
        res = convert_image(
            self.rgba_path,
            "jpeg",
            background=(0, 0, 255),
        )
        self.assertTrue(res.success)

        with Image.open(res.output_path) as out:
            top_pixel = out.getpixel((0, 0))
            self.assertLessEqual(top_pixel[0], 15)
            self.assertLessEqual(top_pixel[1], 15)
            self.assertGreaterEqual(top_pixel[2], 240)

    def test_transparency_flattened_with_color_string(self):
        res = convert_image(
            self.rgba_path,
            "bmp",
            background="#00FF00",
        )
        self.assertTrue(res.success)

        with Image.open(res.output_path) as out:
            top_pixel = out.getpixel((0, 0))
            self.assertEqual(top_pixel, (0, 255, 0))


if __name__ == "__main__":
    unittest.main()

