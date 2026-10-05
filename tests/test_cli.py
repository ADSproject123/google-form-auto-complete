"""Tests for the command-line interface."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image


class TestCLI(unittest.TestCase):
    """Test command line execution of image_converter.py."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="cli_test_")
        self.png_path = Path(self.temp_dir) / "test.png"
        img = Image.new("RGB", (32, 32), color=(20, 120, 220))
        img.save(self.png_path, format="PNG")
        self.script_path = str(
            Path(__file__).resolve().parent.parent / "image_converter.py"
        )

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_cli_check_dependencies(self):
        res = subprocess.run(
            [sys.executable, self.script_path, "--check-dependencies"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("Pillow (PIL)", res.stdout)

    def test_cli_list_formats(self):
        res = subprocess.run(
            [sys.executable, self.script_path, "--list-formats"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("PNG", res.stdout)
        self.assertIn("WEBP", res.stdout)
        self.assertIn("JPEG", res.stdout)

    def test_cli_single_convert(self):
        out_webp = Path(self.temp_dir) / "test.webp"
        res = subprocess.run(
            [
                sys.executable,
                self.script_path,
                str(self.png_path),
                "-f",
                "webp",
                "-o",
                str(out_webp),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(res.returncode, 0)
        self.assertTrue(out_webp.exists())
        self.assertIn("Converted", res.stdout)

    def test_cli_json_output(self):
        out_jpg = Path(self.temp_dir) / "test.jpg"
        res = subprocess.run(
            [
                sys.executable,
                self.script_path,
                str(self.png_path),
                "-f",
                "jpeg",
                "-o",
                str(out_jpg),
                "--json",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(res.returncode, 0)
        data = json.loads(res.stdout)
        self.assertTrue(data["success"])
        self.assertEqual(data["output_format"], "JPEG")


if __name__ == "__main__":
    unittest.main()

