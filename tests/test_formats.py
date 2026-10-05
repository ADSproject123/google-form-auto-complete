"""Tests for format registry, normalization, and alias handling."""

import unittest
from image_converter import (
    FORMAT_ALIASES,
    FORMAT_REGISTRY,
    get_format_info,
    normalize_format,
    UnsupportedFormatError,
)


class TestFormats(unittest.TestCase):
    """Verify format registry integrity and normalization logic."""

    def test_case_insensitivity(self):
        self.assertEqual(normalize_format("png"), "PNG")
        self.assertEqual(normalize_format("PNG"), "PNG")
        self.assertEqual(normalize_format("PnG"), "PNG")
        self.assertEqual(normalize_format(".png"), "PNG")

    def test_common_aliases(self):
        self.assertEqual(normalize_format("jpg"), "JPEG")
        self.assertEqual(normalize_format("jpeg"), "JPEG")
        self.assertEqual(normalize_format("jpe"), "JPEG")
        self.assertEqual(normalize_format("jfif"), "JPEG")
        self.assertEqual(normalize_format("jif"), "JPEG")
        self.assertEqual(normalize_format("jfi"), "JPEG")

        self.assertEqual(normalize_format("tif"), "TIFF")
        self.assertEqual(normalize_format("tiff"), "TIFF")

        self.assertEqual(normalize_format("webp"), "WEBP")
        self.assertEqual(normalize_format("svg"), "SVG")
        self.assertEqual(normalize_format("jbig"), "JBIG")
        self.assertEqual(normalize_format("jbg"), "JBIG")
        self.assertEqual(normalize_format("sixel"), "SIXEL")
        self.assertEqual(normalize_format("six"), "SIXEL")
        self.assertEqual(normalize_format("pct"), "PICT")
        self.assertEqual(normalize_format("pict"), "PICT")
        self.assertEqual(normalize_format("ras"), "SUN")
        self.assertEqual(normalize_format("sun"), "SUN")

    def test_unknown_format_raises_error(self):
        with self.assertRaises(UnsupportedFormatError):
            normalize_format("nonexistent_format_xyz")

        with self.assertRaises(UnsupportedFormatError):
            normalize_format("")

    def test_requested_formats_exist_in_registry(self):
        """Ensure all 70+ formats from user prompt are registered."""
        required = [
            "PNG", "SVG", "JPEG", "ICO", "WEBP", "BMP", "GIF", "TIFF", "DDS",
            "CUR", "HDR", "PSD", "HEIC", "AVIF", "TGA", "RGB", "JP2", "WBMP",
            "HEIF", "JBIG", "EXR", "PPM", "PGM", "PCX", "MAP", "PDB", "XPM",
            "JPS", "SUN", "RGBA", "PICT", "XBM", "FAX", "G3", "PICON", "SGI",
            "PBM", "SIXEL", "PNM", "PCD", "MNG", "YUV", "PGX", "HRZ", "G4",
            "IPL", "UYVY", "PAM", "OTB", "PFM", "RGF", "VIPS", "PAL", "XWD",
            "PALM", "FITS", "RGBO", "VIFF", "MTV", "XV"
        ]
        for fmt in required:
            self.assertIn(
                fmt,
                FORMAT_REGISTRY,
                f"Required format {fmt} missing from FORMAT_REGISTRY",
            )
            info = get_format_info(fmt)
            self.assertEqual(info.canonical_name, fmt)
            self.assertTrue(len(info.extensions) > 0)
            self.assertIn(info.backend, ("pillow", "imagemagick", "svg"))


if __name__ == "__main__":
    unittest.main()

