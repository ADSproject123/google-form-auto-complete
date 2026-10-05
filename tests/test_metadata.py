"""Tests for metadata preservation, EXIF handling, and compression quality."""

import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import convert_image


class TestMetadataAndQuality(unittest.TestCase):
    """Test metadata preservation (EXIF, DPI) and quality settings."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="meta_test_")
        self.img_path = Path(self.temp_dir) / "source.jpg"

        img = Image.new("RGB", (100, 50), color=(120, 180, 240))
        exif = img.getexif()
        exif[274] = 6
        exif[305] = "ImageConverterTestSuite"
        img.save(self.img_path, format="JPEG", dpi=(300, 300), exif=exif)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_dpi_preservation_tiff_and_jpeg(self):
        res_tiff = convert_image(self.img_path, "tiff", preserve_metadata=True)
        self.assertTrue(res_tiff.success)
        with Image.open(res_tiff.output_path) as out:
            dpi = out.info.get("dpi")
            self.assertIsNotNone(dpi)
            self.assertEqual(int(round(dpi[0])), 300)
            self.assertEqual(int(round(dpi[1])), 300)

    def test_exif_orientation_correction(self):
        res = convert_image(self.img_path, "webp", preserve_metadata=True)
        self.assertTrue(res.success)
        with Image.open(res.output_path) as out:
            self.assertEqual(out.size, (50, 100))

    def test_quality_impact_on_file_size(self):
        res_low = convert_image(
            self.img_path, "jpeg", quality=20, output_path=Path(self.temp_dir) / "low.jpg"
        )
        res_high = convert_image(
            self.img_path, "jpeg", quality=95, output_path=Path(self.temp_dir) / "high.jpg"
        )
        self.assertLess(res_low.file_size_bytes, res_high.file_size_bytes)

    def test_webp_lossless(self):
        res = convert_image(self.img_path, "webp", lossless=True)
        self.assertTrue(res.success)
        self.assertTrue(Path(res.output_path).exists())


if __name__ == "__main__":
    unittest.main()

