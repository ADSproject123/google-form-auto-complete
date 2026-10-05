"""Security hardening utilities: path validation, bomb protection, and atomic files."""

import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional, Tuple
from PIL import Image

from image_converter.exceptions import (
    InvalidImageError,
    SecurityError,
    ValidationError,
)

# Defaults
DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB
DEFAULT_MAX_DIMENSIONS = (10000, 10000)
DEFAULT_MAX_PIXELS = 100_000_000  # 100 Megapixels

# Set Pillow's global decompression bomb limit
Image.MAX_IMAGE_PIXELS = DEFAULT_MAX_PIXELS


def validate_input_path(
    input_path: str,
    max_file_size_bytes: int = DEFAULT_MAX_FILE_SIZE_BYTES,
    allowed_directories: Optional[list[str]] = None,
) -> Path:
    """Validate that input path is safe, exists, and within size constraints."""
    if not input_path or not isinstance(input_path, str):
        raise ValidationError("Input path must be a non-empty string.", "input_path")

    try:
        path = Path(input_path).expanduser().resolve()
    except Exception as e:
        raise ValidationError(f"Invalid path syntax: '{input_path}'", "input_path") from e

    if not path.exists():
        raise InvalidImageError(str(path), reason="File does not exist")

    if not path.is_file():
        raise InvalidImageError(str(path), reason="Path is not a regular file")

    if allowed_directories:
        allowed = [Path(d).expanduser().resolve() for d in allowed_directories]
        if not any(path.is_relative_to(d) for d in allowed):
            raise SecurityError(
                f"Access denied: path '{path}' is outside allowed directories.",
                violation_type="directory_traversal",
            )

    try:
        size = path.stat().st_size
    except OSError as e:
        raise InvalidImageError(str(path), reason=f"Cannot stat file: {e}") from e

    if size > max_file_size_bytes:
        raise SecurityError(
            f"File size ({size} bytes) exceeds maximum allowed limit ({max_file_size_bytes} bytes).",
            violation_type="file_size_limit",
        )

    return path


def validate_image_dimensions(
    dimensions: Tuple[int, int],
    max_dimensions: Tuple[int, int] = DEFAULT_MAX_DIMENSIONS,
    max_pixels: int = DEFAULT_MAX_PIXELS,
) -> None:
    """Validate that image dimensions and total pixel count are within safe limits."""
    w, h = dimensions
    if w <= 0 or h <= 0:
        raise SecurityError(
            f"Invalid image dimensions: {w}x{h}", violation_type="invalid_dimensions"
        )

    max_w, max_h = max_dimensions
    if w > max_w or h > max_h:
        raise SecurityError(
            f"Image dimensions ({w}x{h}) exceed maximum allowed dimensions ({max_w}x{max_h}).",
            violation_type="dimensions_limit",
        )

    total_pixels = w * h
    if total_pixels > max_pixels:
        raise SecurityError(
            f"Total image pixels ({total_pixels}) exceed maximum allowed ({max_pixels}) - potential decompression bomb.",
            violation_type="decompression_bomb",
        )


def validate_output_path(
    output_path: str,
    allowed_directories: Optional[list[str]] = None,
) -> Path:
    """Validate output path and ensure parent directory exists or is creatable."""
    if not output_path or not isinstance(output_path, str):
        raise ValidationError("Output path must be a non-empty string.", "output_path")

    try:
        path = Path(output_path).expanduser().resolve()
    except Exception as e:
        raise ValidationError(
            f"Invalid output path syntax: '{output_path}'", "output_path"
        ) from e

    if allowed_directories:
        allowed = [Path(d).expanduser().resolve() for d in allowed_directories]
        if not any(path.is_relative_to(d) for d in allowed):
            raise SecurityError(
                f"Access denied: output path '{path}' is outside allowed directories.",
                violation_type="directory_traversal",
            )

    parent = path.parent
    if not parent.exists():
        try:
            parent.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise ValidationError(
                f"Cannot create destination directory '{parent}': {e}", "output_path"
            ) from e

    return path


@contextmanager
def atomic_output_file(
    target_path: Path,
    suffix: Optional[str] = None,
) -> Generator[Path, None, None]:
    """Context manager for safely writing to an atomic temporary file."""
    parent = target_path.parent
    file_suffix = suffix or target_path.suffix or ".tmp"
    temp_file = None

    try:
        with tempfile.NamedTemporaryFile(
            dir=parent,
            prefix=f".tmp_{target_path.stem}_",
            suffix=file_suffix,
            delete=False,
        ) as f:
            temp_path = Path(f.name)
            temp_file = temp_path

        yield temp_path

        os.replace(str(temp_path), str(target_path))
        temp_file = None

    finally:
        if temp_file is not None and temp_file.exists():
            try:
                temp_file.unlink()
            except OSError:
                pass

