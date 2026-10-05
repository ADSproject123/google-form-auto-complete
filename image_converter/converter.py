"""Core conversion orchestrator for single and batch image processing."""

from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from PIL import Image

from image_converter.backends.imagemagick_backend import ImageMagickBackend
from image_converter.backends.pillow_backend import PillowBackend
from image_converter.backends.svg_backend import SVGBackend
from image_converter.exceptions import (
    ImageConverterError,
    InvalidImageError,
    MissingDependencyError,
    UnsupportedFormatError,
    ValidationError,
)
from image_converter.formats import (
    FORMAT_REGISTRY,
    get_format_info,
    get_primary_extension,
    normalize_format,
)
from image_converter.models import BatchResult, ConversionResult
from image_converter.security import (
    validate_input_path,
    validate_output_path,
)

_PILLOW_BACKEND = PillowBackend()
_IMAGEMAGICK_BACKEND = ImageMagickBackend()
_SVG_BACKEND = SVGBackend()


def detect_input_format(input_path: Path) -> str:
    """Detect image format by sniffing file header content, falling back to extension."""
    try:
        with Image.open(input_path) as img:
            fmt = img.format
            if fmt:
                try:
                    return normalize_format(fmt)
                except UnsupportedFormatError:
                    pass
    except Exception:
        pass

    ext = input_path.suffix.lstrip(".")
    if ext:
        try:
            return normalize_format(ext)
        except UnsupportedFormatError:
            pass

    raise InvalidImageError(
        str(input_path),
        reason="Could not detect image format from file content or extension",
    )


def resolve_destination_path(
    input_path: Path,
    output_format: str,
    output_path: Optional[str] = None,
    overwrite: bool = False,
    output_directory: Optional[str] = None,
) -> Path:
    """Generate or validate output destination path, handling collisions when overwrite=False."""
    canonical_format = normalize_format(output_format)
    primary_ext = get_primary_extension(canonical_format)

    if output_path is not None:
        target = validate_output_path(output_path)
    elif output_directory is not None:
        out_dir = Path(output_directory).expanduser().resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / f"{input_path.stem}{primary_ext}"
    else:
        target = input_path.parent / f"{input_path.stem}{primary_ext}"

    if overwrite:
        return target

    if target.exists():
        stem = target.stem
        suffix = target.suffix
        parent = target.parent
        counter = 1
        while target.exists():
            target = parent / f"{stem}_{counter}{suffix}"
            counter += 1

    return target


def convert_image(
    input_path: Union[str, Path],
    output_format: str,
    output_path: Optional[Union[str, Path]] = None,
    **options: Any,
) -> ConversionResult:
    max_file_size = options.get("max_file_size_bytes", 100 * 1024 * 1024)
    in_path = validate_input_path(str(input_path), max_file_size_bytes=max_file_size)

    canonical_format = normalize_format(output_format)
    format_info = get_format_info(canonical_format)

    detected_input_fmt = detect_input_format(in_path)

    overwrite = bool(options.get("overwrite", False))
    out_path = resolve_destination_path(
        input_path=in_path,
        output_format=canonical_format,
        output_path=str(output_path) if output_path else None,
        overwrite=overwrite,
    )

    if format_info.backend == "svg":
        backend = _SVG_BACKEND
    elif format_info.backend == "pillow" and _PILLOW_BACKEND.can_handle_output(format_info):
        backend = _PILLOW_BACKEND
    else:
        if not _IMAGEMAGICK_BACKEND.is_available():
            _IMAGEMAGICK_BACKEND.check_dependency_or_raise(canonical_format)
        backend = _IMAGEMAGICK_BACKEND

    result = backend.convert(
        input_path=in_path,
        output_path=out_path,
        target_format=canonical_format,
        options=options,
    )
    result.input_format = detected_input_fmt
    return result


def convert_images(
    input_paths: List[Union[str, Path]],
    output_format: str,
    output_directory: Optional[Union[str, Path]] = None,
    fail_fast: bool = False,
    **options: Any,
) -> BatchResult:
    if not input_paths:
        return BatchResult(total=0, succeeded=0, failed=0, results=[], errors=[])

    canonical_format = normalize_format(output_format)
    results: List[ConversionResult] = []
    errors: List[Dict[str, Any]] = []
    succeeded = 0
    failed = 0

    for path_item in input_paths:
        p = Path(path_item)
        try:
            dest_path = None
            if output_directory:
                dest_dir = Path(output_directory).expanduser().resolve()
                dest_dir.mkdir(parents=True, exist_ok=True)
                primary_ext = get_primary_extension(canonical_format)
                dest_path = dest_dir / f"{p.stem}{primary_ext}"
                if not options.get("overwrite", False) and dest_path.exists():
                    counter = 1
                    while dest_path.exists():
                        dest_path = dest_dir / f"{p.stem}_{counter}{primary_ext}"
                        counter += 1

            res = convert_image(
                input_path=p,
                output_format=canonical_format,
                output_path=dest_path,
                **options,
            )
            results.append(res)
            succeeded += 1

        except Exception as e:
            failed += 1
            err_dict = {
                "input_path": str(p),
                "error_type": type(e).__name__,
                "error_message": str(e),
            }
            errors.append(err_dict)

            if fail_fast:
                raise

    return BatchResult(
        total=len(input_paths),
        succeeded=succeeded,
        failed=failed,
        results=results,
        errors=errors,
    )

