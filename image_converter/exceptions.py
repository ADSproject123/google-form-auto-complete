"""Custom exception hierarchy for the image conversion utility."""

from typing import Optional


class ImageConverterError(Exception):
    """Base exception for all image converter errors."""

    def __init__(self, message: str, details: Optional[dict] = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def __str__(self) -> str:
        return self.message


class UnsupportedFormatError(ImageConverterError):
    """Raised when an input or output format is not supported or recognized."""

    def __init__(
        self,
        format_name: str,
        message: Optional[str] = None,
        is_input: bool = False,
        supported_formats: Optional[list[str]] = None,
    ) -> None:
        target = "input" if is_input else "output"
        if message is None:
            message = f"Unsupported {target} format: '{format_name}'."
            if supported_formats:
                sample = ", ".join(sorted(supported_formats)[:10])
                message += f" Available formats include: {sample}..."
        super().__init__(
            message,
            {
                "format": format_name,
                "is_input": is_input,
                "supported_formats": supported_formats,
            },
        )
        self.format_name = format_name
        self.is_input = is_input


class InvalidImageError(ImageConverterError):
    """Raised when an input image cannot be read, decoded, or is corrupted."""

    def __init__(
        self,
        file_path: str,
        reason: Optional[str] = None,
        original_error: Optional[Exception] = None,
    ) -> None:
        message = f"Invalid or corrupted image file: '{file_path}'"
        if reason:
            message += f" ({reason})"
        super().__init__(
            message,
            {
                "file_path": file_path,
                "reason": reason,
                "original_error": str(original_error) if original_error else None,
            },
        )
        self.file_path = file_path
        self.reason = reason
        self.original_error = original_error


class ConversionError(ImageConverterError):
    """Raised when an error occurs during image conversion processing or saving."""

    def __init__(
        self,
        message: str,
        source_format: Optional[str] = None,
        target_format: Optional[str] = None,
        original_error: Optional[Exception] = None,
    ) -> None:
        super().__init__(
            message,
            {
                "source_format": source_format,
                "target_format": target_format,
                "original_error": str(original_error) if original_error else None,
            },
        )
        self.source_format = source_format
        self.target_format = target_format
        self.original_error = original_error


class MissingDependencyError(ImageConverterError):
    """Raised when an external tool, library, or codec is required but missing."""

    def __init__(
        self,
        dependency_name: str,
        format_name: str,
        installation_instructions: Optional[str] = None,
    ) -> None:
        message = (
            f"Format '{format_name}' requires external dependency '{dependency_name}', "
            f"which is not installed or available on this system."
        )
        if installation_instructions:
            message += f"\nHow to install: {installation_instructions}"
        super().__init__(
            message,
            {
                "dependency": dependency_name,
                "format": format_name,
                "installation_instructions": installation_instructions,
            },
        )
        self.dependency_name = dependency_name
        self.format_name = format_name
        self.installation_instructions = installation_instructions


class SecurityError(ImageConverterError):
    """Raised when an operation violates security limits (path traversal, bomb, size)."""

    def __init__(self, message: str, violation_type: str = "security") -> None:
        super().__init__(message, {"violation_type": violation_type})
        self.violation_type = violation_type


class ValidationError(ImageConverterError):
    """Raised when user-supplied options or arguments fail validation."""

    def __init__(self, message: str, parameter: Optional[str] = None) -> None:
        super().__init__(message, {"parameter": parameter})
        self.parameter = parameter

