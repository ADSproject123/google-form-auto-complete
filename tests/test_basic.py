"""Tests for core raster conversions and file destination handling."""

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import convert_image


class TestBasicConversions(unittest.TestCase):
    """Test raster image conversions across standard formats."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="img_conv_test_")
        self.png_path = Path(self.temp_dir) / "sample.png"
        img = Image.new("RGB", (64, 48), color=(200, 50, 80))
        img.save(self.png_path, format="PNG")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_png_to_webp(self):
        res = convert_image(self.png_path, "webp")
        self.assertTrue(res.success)
        self.assertEqual(res.output_format, "WEBP")
        self.assertTrue(Path(res.output_path).exists())
        self.assertEqual(res.dimensions, (64, 48))
        self.assertEqual(res["output_format"], "WEBP")

    def test_png_to_jpeg(self):
        res = convert_image(self.png_path, "jpeg", quality=85)
        self.assertTrue(res.success)
        self.assertEqual(res.output_format, "JPEG")
        self.assertTrue(Path(res.output_path).exists())

        with Image.open(res.output_path) as out_img:
            self.assertEqual(out_img.format, "JPEG")
            self.assertEqual(out_img.size, (64, 48))

    def test_jpeg_to_png(self):
        jpg_path = Path(self.temp_dir) / "sample.jpg"
        convert_image(self.png_path, "jpeg", output_path=jpg_path)

        res = convert_image(jpg_path, "png")
        self.assertTrue(res.success)
        self.assertEqual(res.output_format, "PNG")

    def test_png_to_bmp_tiff_gif_ico(self):
        for fmt in ("bmp", "tiff", "gif", "ico"):
            res = convert_image(self.png_path, fmt)
            self.assertTrue(res.success, f"Failed converting to {fmt}")
            self.assertTrue(Path(res.output_path).exists())

    def test_png_to_netpbm_ppm_pgm_pbm(self):
        for fmt in ("ppm", "pgm", "pbm"):
            res = convert_image(self.png_path, fmt)
            self.assertTrue(res.success, f"Failed converting to {fmt}")
            self.assertTrue(Path(res.output_path).exists())

    def test_png_to_tga_pcx_sgi_dds(self):
        for fmt in ("tga", "pcx", "sgi", "dds"):
            res = convert_image(self.png_path, fmt)
            self.assertTrue(res.success, f"Failed converting to {fmt}")
            self.assertTrue(Path(res.output_path).exists())

    def test_automatic_output_path_generation(self):
        res = convert_image(self.png_path, "webp")
        expected = Path(self.temp_dir) / "sample.webp"
        self.assertEqual(Path(res.output_path), expected)

    def test_overwrite_false_collision_avoidance(self):
        res1 = convert_image(self.png_path, "webp", overwrite=False)
        self.assertEqual(Path(res1.output_path).name, "sample.webp")

        res2 = convert_image(self.png_path, "webp", overwrite=False)
        self.assertEqual(Path(res2.output_path).name, "sample_1.webp")

        res3 = convert_image(self.png_path, "webp", overwrite=False)
        self.assertEqual(Path(res3.output_path).name, "sample_2.webp")

    def test_overwrite_true(self):
        res1 = convert_image(self.png_path, "webp", overwrite=True)
        res2 = convert_image(self.png_path, "webp", overwrite=True)
        self.assertEqual(res1.output_path, res2.output_path)


if __name__ == "__main__":
    unittest.main()

