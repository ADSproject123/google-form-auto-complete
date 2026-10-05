"""Tests for multi-frame animation preservation and fallback handling."""

import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

from image_converter import ConversionError, convert_image


class TestAnimation(unittest.TestCase):
    """Test animation handling across supported and unsupported formats."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="anim_test_")
        self.gif_path = Path(self.temp_dir) / "animated.gif"

        frame1 = Image.new("RGB", (32, 32), color=(255, 0, 0))
        frame2 = Image.new("RGB", (32, 32), color=(0, 255, 0))
        frame3 = Image.new("RGB", (32, 32), color=(0, 0, 255))

        frame1.save(
            self.gif_path,
            format="GIF",
            save_all=True,
            append_images=[frame2, frame3],
            duration=120,
            loop=0,
        )

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_gif_to_animated_webp(self):
        res = convert_image(self.gif_path, "webp", preserve_animation=True)
        self.assertTrue(res.success)
        self.assertTrue(res.is_animated)
        self.assertEqual(res.frame_count, 3)

        with Image.open(res.output_path) as out:
            self.assertTrue(getattr(out, "is_animated", False))
            self.assertEqual(out.n_frames, 3)

    def test_animated_webp_to_gif(self):
        webp_res = convert_image(self.gif_path, "webp", preserve_animation=True)
        gif_res = convert_image(webp_res.output_path, "gif", preserve_animation=True)

        self.assertTrue(gif_res.success)
        self.assertTrue(gif_res.is_animated)
        self.assertEqual(gif_res.frame_count, 3)

        with Image.open(gif_res.output_path) as out:
            self.assertTrue(getattr(out, "is_animated", False))
            self.assertEqual(out.n_frames, 3)

    def test_animation_to_non_animated_format_defaults_to_first_frame(self):
        res = convert_image(self.gif_path, "jpeg", preserve_animation=True)
        self.assertTrue(res.success)
        self.assertFalse(res.is_animated)
        self.assertEqual(res.frame_count, 1)
        self.assertTrue(any("does not support animation" in w for w in res.warnings))

        with Image.open(res.output_path) as out:
            self.assertEqual(out.format, "JPEG")
            pixel = out.getpixel((0, 0))
            self.assertGreater(pixel[0], 200)

    def test_strict_animation_raises_error_on_non_animated_target(self):
        with self.assertRaises(ConversionError):
            convert_image(
                self.gif_path,
                "jpeg",
                preserve_animation=True,
                strict_animation=True,
            )

    def test_preserve_animation_false_exports_single_frame(self):
        res = convert_image(self.gif_path, "webp", preserve_animation=False)
        self.assertTrue(res.success)
        self.assertFalse(res.is_animated)
        self.assertEqual(res.frame_count, 1)


if __name__ == "__main__":
    unittest.main()

