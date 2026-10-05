"""Production-ready Python image conversion utility."""

from image_converter.converter import convert_image, convert_images, detect_input_format
from image_converter.exceptions import (
    ConversionError,
    ImageConverterError,
    InvalidImageError,
    MissingDependencyError,
    SecurityError,
    UnsupportedFormatError,
    ValidationError,
)
from image_converter.formats import (
    FORMAT_ALIASES,
    FORMAT_REGISTRY,
    get_format_info,
    get_primary_extension,
    normalize_format,
)
from image_converter.models import BatchResult, ConversionResult, FormatInfo

__version__ = "1.0.0"

__all__ = [
    "convert_image",
    "convert_images",
    "detect_input_format",
    "FORMAT_REGISTRY",
    "FORMAT_ALIASES",
    "get_format_info",
    "get_primary_extension",
    "normalize_format",
    "ConversionResult",
    "BatchResult",
    "FormatInfo",
    "ImageConverterError",
    "UnsupportedFormatError",
    "InvalidImageError",
    "ConversionError",
    "MissingDependencyError",
    "SecurityError",
    "ValidationError",
]

