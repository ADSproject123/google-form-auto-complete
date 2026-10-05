"""ImageMagick subprocess backend for advanced and specialty image formats."""

import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from image_converter.backends.base import BaseBackend
from image_converter.exceptions import (
    ConversionError,
    MissingDependencyError,
)
from image_converter.formats import get_format_info
from image_converter.models import ConversionResult, FormatInfo
from image_converter.security import (
    atomic_output_file,
    validate_image_dimensions,
)


class ImageMagickBackend(BaseBackend):
    """Backend utilizing ImageMagick via safe subprocess execution."""

    def __init__(self) -> None:
        self._binary_path: Optional[str] = None
        self._checked_binary = False
        self._supported_formats: Optional[Set[str]] = None

    @property
    def name(self) -> str:
        return "imagemagick"

    def get_executable(self) -> Optional[str]:
        if not self._checked_binary:
            self._binary_path = shutil.which("magick") or shutil.which("convert")
            self._checked_binary = True
        return self._binary_path

    def is_available(self) -> bool:
        return self.get_executable() is not None

    def get_supported_formats(self) -> Set[str]:
        if self._supported_formats is not None:
            return self._supported_formats

        binary = self.get_executable()
        if not binary:
            self._supported_formats = set()
            return self._supported_formats

        formats: Set[str] = set()
        try:
            res = subprocess.run(
                [binary, "-list", "format"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    parts = line.strip().split()
                    if len(parts) >= 2:
                        fmt = parts[0].rstrip("*").upper()
                        formats.add(fmt)
        except Exception:
            pass

        self._supported_formats = formats
        return formats

    def can_handle_output(self, format_info: FormatInfo) -> bool:
        if not self.is_available():
            return False
        im_fmt = format_info.imagemagick_format or format_info.canonical_name
        supported = self.get_supported_formats()
        return (not supported) or (im_fmt.upper() in supported)

    def check_dependency_or_raise(self, target_format: str) -> None:
        binary = self.get_executable()
        if not binary:
            if target_format in ("HEIC", "HEIF"):
                raise MissingDependencyError(
                    dependency_name="libheif / pillow-heif",
                    format_name=target_format,
                    installation_instructions=(
                        "HEIC/HEIF conversion is unavailable because the required codec/delegate is not installed. "
                        "Install 'pillow-heif' (pip install pillow-heif) or install ImageMagick with libheif support "
                        "(e.g. 'sudo apt-get install libheif-examples imagemagick')."
                    ),
                )
            elif target_format == "AVIF":
                raise MissingDependencyError(
                    dependency_name="libavif / pillow-heif",
                    format_name=target_format,
                    installation_instructions=(
                        "AVIF conversion is unavailable because the required codec/delegate is not installed. "
                        "Install Pillow with AVIF support (e.g. 'pip install pillow-heif' or 'sudo apt-get install libavif-bin imagemagick')."
                    ),
                )
            elif target_format == "EXR":
                raise MissingDependencyError(
                    dependency_name="OpenEXR",
                    format_name="EXR",
                    installation_instructions=(
                        "OpenEXR conversion is unavailable because the required ImageMagick delegate is not installed. "
                        "Install OpenEXR and ImageMagick (e.g. 'sudo apt-get install libopenexr-dev imagemagick')."
                    ),
                )
            elif target_format == "HDR":
                raise MissingDependencyError(
                    dependency_name="ImageMagick",
                    format_name="HDR",
                    installation_instructions=(
                        "HDR conversion is unavailable because ImageMagick is not installed. "
                        "Install ImageMagick (e.g. 'sudo apt-get install imagemagick')."
                    ),
                )
            else:
                raise MissingDependencyError(
                    dependency_name="ImageMagick",
                    format_name=target_format,
                    installation_instructions=(
                        f"Format '{target_format}' requires ImageMagick, which is not installed. "
                        "Install ImageMagick (e.g. 'sudo apt-get install imagemagick' or 'brew install imagemagick')."
                    ),
                )

        supported = self.get_supported_formats()
        target_upper = target_format.upper()
        if supported and target_upper not in supported:
            raise MissingDependencyError(
                dependency_name=f"ImageMagick delegate for {target_format}",
                format_name=target_format,
                installation_instructions=(
                    f"ImageMagick is installed, but the delegate library for '{target_format}' is missing or not enabled. "
                    f"Please install the appropriate system library (e.g. lib{target_format.lower()}) and recompile or reinstall ImageMagick."
                ),
            )

    def convert(
        self,
        input_path: Path,
        output_path: Path,
        target_format: str,
        options: Dict[str, Any],
    ) -> ConversionResult:
        self.check_dependency_or_raise(target_format)

        binary = self.get_executable()
        assert binary is not None

        start_time = time.time()
        format_info = get_format_info(target_format)
        warnings: List[str] = []

        preserve_metadata = options.get("preserve_metadata", True)
        preserve_animation = options.get("preserve_animation", True)
        background = options.get("background", "white")
        quality = options.get("quality", None)
        timeout_seconds = options.get("timeout_seconds", 60)

        if isinstance(background, (tuple, list)):
            bg_str = f"rgb({background[0]},{background[1]},{background[2]})"
        else:
            bg_str = str(background)

        cmd: List[str] = [binary]

        if not format_info.supports_animation or not preserve_animation:
            input_spec = f"{input_path}[0]"
        else:
            input_spec = str(input_path)

        cmd.append(input_spec)

        if not preserve_metadata:
            cmd.append("-strip")
        else:
            cmd.extend(["-auto-orient"])

        if not format_info.supports_alpha:
            cmd.extend(["-background", bg_str, "-flatten"])

        if quality is not None and format_info.supports_quality:
            cmd.extend(["-quality", str(int(quality))])

        im_format_prefix = (
            format_info.imagemagick_format or format_info.canonical_name
        )

        with atomic_output_file(output_path) as tmp_target:
            output_spec = f"{im_format_prefix}:{tmp_target}"
            full_cmd = cmd + [output_spec]

            try:
                result = subprocess.run(
                    full_cmd,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    check=False,
                )
                if result.returncode != 0:
                    err_msg = result.stderr.strip() or f"Process exited with code {result.returncode}"
                    raise ConversionError(
                        f"ImageMagick conversion failed: {err_msg}",
                        source_format=str(input_path.suffix),
                        target_format=target_format,
                    )
            except subprocess.TimeoutExpired as e:
                raise ConversionError(
                    f"ImageMagick conversion timed out after {timeout_seconds}s"
                ) from e
            except OSError as e:
                raise ConversionError(
                    f"Failed to execute ImageMagick binary '{binary}': {e}"
                ) from e

        file_size = output_path.stat().st_size
        elapsed = (time.time() - start_time) * 1000.0

        return ConversionResult(
            success=True,
            input_path=str(input_path),
            output_path=str(output_path),
            input_format=str(input_path.suffix).lstrip(".").upper(),
            output_format=target_format,
            backend_used=self.name,
            file_size_bytes=file_size,
            dimensions=(0, 0),
            color_mode="",
            has_transparency=format_info.supports_alpha,
            is_animated=format_info.supports_animation and preserve_animation,
            frame_count=1,
            duration_ms=round(elapsed, 2),
            metadata_preserved=preserve_metadata,
            warnings=warnings,
        )

