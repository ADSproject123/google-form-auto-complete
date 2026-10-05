"""Pillow-based conversion backend for standard raster formats."""

import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from PIL import Image, ImageColor, ImageOps, ImageSequence, features

from image_converter.backends.base import BaseBackend
from image_converter.exceptions import (
    ConversionError,
    InvalidImageError,
    SecurityError,
)
from image_converter.formats import FORMAT_REGISTRY, get_format_info
from image_converter.models import ConversionResult, FormatInfo
from image_converter.security import (
    atomic_output_file,
    validate_image_dimensions,
)

# Optional pillow-heif support
_HAS_PILLOW_HEIF = False
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HAS_PILLOW_HEIF = True
except ImportError:
    pass


class PillowBackend(BaseBackend):
    """Primary backend using Pillow (PIL) for image operations."""

    @property
    def name(self) -> str:
        return "pillow"

    def is_available(self) -> bool:
        return True

    def can_handle_output(self, format_info: FormatInfo) -> bool:
        target = format_info.pillow_format or format_info.canonical_name
        Image.init()
        if target in Image.SAVE:
            return True
        if format_info.canonical_name in ("HEIC", "HEIF") and _HAS_PILLOW_HEIF:
            return True
        if format_info.canonical_name == "AVIF" and features.check("avif"):
            return True
        return False

    @staticmethod
    def parse_background_color(
        bg: Union[str, Tuple[int, int, int], Tuple[int, int, int, int], List[int]],
    ) -> Tuple[int, int, int]:
        """Parse user-provided background into an RGB tuple."""
        if isinstance(bg, str):
            try:
                rgb = ImageColor.getrgb(bg)
                return rgb[:3]
            except ValueError as e:
                raise ConversionError(f"Invalid background color: '{bg}'") from e
        elif isinstance(bg, (tuple, list)):
            if len(bg) in (3, 4):
                return (int(bg[0]), int(bg[1]), int(bg[2]))
            raise ConversionError(
                f"Background color tuple must have 3 or 4 elements, got {len(bg)}"
            )
        raise ConversionError(f"Unsupported background color format: {type(bg)}")

    @staticmethod
    def has_transparency(img: Image.Image) -> bool:
        """Check whether image has an alpha channel or transparent pixels."""
        if img.mode in ("RGBA", "LA", "PA"):
            return True
        if img.mode == "P" and "transparency" in img.info:
            return True
        if "transparency" in img.info:
            return True
        return False

    @staticmethod
    def flatten_transparency(
        img: Image.Image,
        background: Tuple[int, int, int] = (255, 255, 255),
    ) -> Image.Image:
        """Composite transparent pixels onto specified background color."""
        if not PillowBackend.has_transparency(img):
            return img

        rgba = img.convert("RGBA")
        bg_img = Image.new("RGBA", rgba.size, background + (255,))
        composited = Image.alpha_composite(bg_img, rgba)
        return composited.convert("RGB")

    @staticmethod
    def adapt_color_mode(
        img: Image.Image,
        format_info: FormatInfo,
        background: Tuple[int, int, int] = (255, 255, 255),
    ) -> Image.Image:
        """Adapt image color mode for target format requirements."""
        allowed = format_info.allowed_modes
        source_mode = img.mode

        if not format_info.supports_alpha and PillowBackend.has_transparency(img):
            img = PillowBackend.flatten_transparency(img, background)
            source_mode = img.mode

        if not allowed:
            return img

        if source_mode in allowed:
            return img

        target_name = format_info.canonical_name

        if target_name in ("PBM", "XBM"):
            return img.convert("1")
        if target_name == "PGM":
            return img.convert("L")
        if target_name == "PPM":
            return img.convert("RGB")
        if target_name == "PALM":
            return img.convert("P")
        if target_name == "GIF":
            return img.convert("P", palette=Image.ADAPTIVE)
        if target_name == "JPEG":
            if source_mode in ("L", "CMYK"):
                return img
            return img.convert("RGB")
        if target_name == "BMP":
            if source_mode in ("1", "L", "P", "RGB"):
                return img
            return img.convert("RGB")
        if target_name in ("WEBP", "PNG", "TIFF", "TGA", "DDS", "SGI"):
            if format_info.supports_alpha and source_mode in ("RGBA", "LA"):
                return img.convert("RGBA")
            if source_mode in ("L", "1") and source_mode in allowed:
                return img
            return img.convert("RGB")

        if "RGB" in allowed:
            return img.convert("RGB")
        if "L" in allowed:
            return img.convert("L")
        if "1" in allowed:
            return img.convert("1")

        return img

    def convert(
        self,
        input_path: Path,
        output_path: Path,
        target_format: str,
        options: Dict[str, Any],
    ) -> ConversionResult:
        start_time = time.time()
        warnings: List[str] = []
        format_info = get_format_info(target_format)

        preserve_metadata = options.get("preserve_metadata", True)
        preserve_animation = options.get("preserve_animation", True)
        strict_animation = options.get("strict_animation", False)
        background = self.parse_background_color(
            options.get("background", (255, 255, 255))
        )
        quality = options.get("quality", None)
        lossless = options.get("lossless", None)
        optimize = options.get("optimize", None)
        progressive = options.get("progressive", None)
        subsampling = options.get("subsampling", None)
        compression = options.get("compression", None)
        max_dimensions = options.get("max_dimensions", (10000, 10000))
        max_pixels = options.get("max_pixels", 100_000_000)

        try:
            with Image.open(input_path) as src_img:
                src_format = src_img.format or input_path.suffix.lstrip(".").upper()
                dimensions = src_img.size
                validate_image_dimensions(
                    dimensions, max_dimensions=max_dimensions, max_pixels=max_pixels
                )

                input_has_transparency = self.has_transparency(src_img)
                is_animated = bool(
                    getattr(src_img, "is_animated", False)
                    and getattr(src_img, "n_frames", 1) > 1
                )
                frame_count = getattr(src_img, "n_frames", 1) if is_animated else 1

                exif_data = None
                icc_profile = None
                dpi = None
                metadata_preserved = False

                if preserve_metadata:
                    try:
                        exif_obj = src_img.getexif()
                        if not is_animated:
                            src_img = ImageOps.exif_transpose(src_img)
                        if exif_obj:
                            exif_obj[274] = 1
                            exif_data = exif_obj
                    except Exception:
                        pass

                    icc_profile = src_img.info.get("icc_profile")
                    dpi = src_img.info.get("dpi")

                save_kwargs: Dict[str, Any] = {}
                save_format = format_info.pillow_format or format_info.canonical_name
                save_kwargs["format"] = save_format

                if target_format == "JPEG":
                    if quality is not None:
                        save_kwargs["quality"] = int(quality)
                    if optimize is not None:
                        save_kwargs["optimize"] = bool(optimize)
                    if progressive is not None:
                        save_kwargs["progressive"] = bool(progressive)
                    if subsampling is not None:
                        save_kwargs["subsampling"] = subsampling
                    if exif_data:
                        save_kwargs["exif"] = exif_data
                        metadata_preserved = True
                    if icc_profile:
                        save_kwargs["icc_profile"] = icc_profile
                        metadata_preserved = True
                    if dpi:
                        save_kwargs["dpi"] = dpi
                        metadata_preserved = True

                elif target_format == "WEBP":
                    if quality is not None:
                        save_kwargs["quality"] = int(quality)
                    if lossless is not None:
                        save_kwargs["lossless"] = bool(lossless)
                    if optimize is not None:
                        save_kwargs["optimize"] = bool(optimize)
                    if exif_data:
                        save_kwargs["exif"] = exif_data
                        metadata_preserved = True
                    if icc_profile:
                        save_kwargs["icc_profile"] = icc_profile
                        metadata_preserved = True

                elif target_format == "PNG":
                    if optimize is not None:
                        save_kwargs["optimize"] = bool(optimize)
                    compress_level = options.get("compress_level")
                    if compress_level is not None:
                        save_kwargs["compress_level"] = int(compress_level)
                    if icc_profile:
                        save_kwargs["icc_profile"] = icc_profile
                        metadata_preserved = True
                    if dpi:
                        save_kwargs["dpi"] = dpi
                        metadata_preserved = True

                elif target_format == "TIFF":
                    if compression:
                        save_kwargs["compression"] = compression
                    if quality is not None:
                        save_kwargs["quality"] = int(quality)
                    if dpi:
                        save_kwargs["dpi"] = dpi
                        metadata_preserved = True
                    if exif_data:
                        save_kwargs["exif"] = exif_data
                        metadata_preserved = True
                    if icc_profile:
                        save_kwargs["icc_profile"] = icc_profile
                        metadata_preserved = True

                elif target_format == "BMP":
                    if dpi:
                        save_kwargs["dpi"] = dpi
                        metadata_preserved = True

                elif target_format == "ICO":
                    if "sizes" in options:
                        save_kwargs["sizes"] = options["sizes"]

                if is_animated and preserve_animation:
                    if format_info.supports_animation:
                        frames: List[Image.Image] = []
                        durations: List[int] = []
                        loop = src_img.info.get("loop", 0)

                        for frame in ImageSequence.Iterator(src_img):
                            frame_copy = frame.copy()
                            frame_copy = self.adapt_color_mode(
                                frame_copy, format_info, background
                            )
                            frames.append(frame_copy)
                            durations.append(frame.info.get("duration", 100))

                        save_kwargs["save_all"] = True
                        save_kwargs["append_images"] = frames[1:]
                        save_kwargs["duration"] = durations
                        save_kwargs["loop"] = loop

                        with atomic_output_file(output_path) as tmp_target:
                            frames[0].save(tmp_target, **save_kwargs)

                        final_mode = frames[0].mode
                    else:
                        if strict_animation:
                            raise ConversionError(
                                f"Format '{target_format}' does not support animation and strict_animation is enabled."
                            )
                        warnings.append(
                            f"Format '{target_format}' does not support animation; exporting first frame."
                        )
                        first_frame = src_img.copy()
                        processed_img = self.adapt_color_mode(
                            first_frame, format_info, background
                        )
                        final_mode = processed_img.mode

                        with atomic_output_file(output_path) as tmp_target:
                            processed_img.save(tmp_target, **save_kwargs)
                else:
                    processed_img = self.adapt_color_mode(
                        src_img, format_info, background
                    )
                    final_mode = processed_img.mode

                    with atomic_output_file(output_path) as tmp_target:
                        processed_img.save(tmp_target, **save_kwargs)

        except (SecurityError, ConversionError, InvalidImageError):
            raise
        except Image.UnidentifiedImageError as e:
            raise InvalidImageError(
                str(input_path),
                reason=f"Cannot identify or decode image: {e}",
                original_error=e,
            ) from e
        except Exception as e:
            raise ConversionError(
                f"Pillow failed converting '{input_path}' to '{target_format}': {e}",
                source_format=str(input_path.suffix),
                target_format=target_format,
                original_error=e,
            ) from e

        file_size = output_path.stat().st_size
        elapsed = (time.time() - start_time) * 1000.0

        return ConversionResult(
            success=True,
            input_path=str(input_path),
            output_path=str(output_path),
            input_format=src_format,
            output_format=target_format,
            backend_used=self.name,
            file_size_bytes=file_size,
            dimensions=dimensions,
            color_mode=final_mode,
            has_transparency=input_has_transparency and format_info.supports_alpha,
            is_animated=is_animated and preserve_animation and format_info.supports_animation,
            frame_count=frame_count if (is_animated and preserve_animation and format_info.supports_animation) else 1,
            duration_ms=round(elapsed, 2),
            metadata_preserved=metadata_preserved,
            warnings=warnings,
        )

