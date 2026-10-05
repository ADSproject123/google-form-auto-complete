#!/usr/bin/env python3
"""Entry-point script for image converter CLI and module access."""

import sys
from image_converter import (
    convert_image,
    convert_images,
    detect_input_format,
    FORMAT_REGISTRY,
    FORMAT_ALIASES,
    get_format_info,
    normalize_format,
    ConversionResult,
    BatchResult,
    ImageConverterError,
    UnsupportedFormatError,
    InvalidImageError,
    ConversionError,
    MissingDependencyError,
    SecurityError,
    ValidationError,
)
from image_converter.cli import main

if __name__ == "__main__":
    sys.exit(main())

