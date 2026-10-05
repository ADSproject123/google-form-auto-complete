"""Data models and result classes for the image converter."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union


@dataclass
class FormatInfo:
    """Metadata and capability definition for a specific image format."""

    canonical_name: str
    extensions: List[str]
    mime_type: str
    backend: str  # 'pillow', 'imagemagick', 'svg'
    supports_alpha: bool = False
    supports_animation: bool = False
    supports_metadata: bool = False
    supports_lossless: bool = False
    supports_quality: bool = False
    pillow_format: Optional[str] = None
    imagemagick_format: Optional[str] = None
    description: str = ""
    delegate_needed: Optional[str] = None
    allowed_modes: Optional[List[str]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "canonical_name": self.canonical_name,
            "extensions": self.extensions,
            "mime_type": self.mime_type,
            "backend": self.backend,
            "supports_alpha": self.supports_alpha,
            "supports_animation": self.supports_animation,
            "supports_metadata": self.supports_metadata,
            "supports_lossless": self.supports_lossless,
            "supports_quality": self.supports_quality,
            "description": self.description,
            "delegate_needed": self.delegate_needed,
        }


@dataclass
class ConversionResult:
    """Result of a single image conversion operation.

    Supports both object attribute access (result.output_path) and dictionary
    key access (result['output_path']) for backwards and forwards compatibility.
    """

    success: bool
    input_path: str
    output_path: str
    input_format: str
    output_format: str
    backend_used: str
    file_size_bytes: int = 0
    dimensions: Tuple[int, int] = (0, 0)
    color_mode: str = ""
    has_transparency: bool = False
    is_animated: bool = False
    frame_count: int = 1
    duration_ms: Optional[float] = None
    metadata_preserved: bool = False
    warnings: List[str] = field(default_factory=list)
    error_message: Optional[str] = None

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError:
            raise KeyError(key)

    def __setitem__(self, key: str, value: Any) -> None:
        setattr(self, key, value)

    def __contains__(self, key: str) -> bool:
        return hasattr(self, key)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "input_path": self.input_path,
            "output_path": self.output_path,
            "input_format": self.input_format,
            "output_format": self.output_format,
            "backend_used": self.backend_used,
            "file_size_bytes": self.file_size_bytes,
            "dimensions": self.dimensions,
            "color_mode": self.color_mode,
            "has_transparency": self.has_transparency,
            "is_animated": self.is_animated,
            "frame_count": self.frame_count,
            "duration_ms": self.duration_ms,
            "metadata_preserved": self.metadata_preserved,
            "warnings": self.warnings,
            "error_message": self.error_message,
        }


@dataclass
class BatchResult:
    """Summary of batch image conversions."""

    total: int
    succeeded: int
    failed: int
    results: List[ConversionResult] = field(default_factory=list)
    errors: List[Dict[str, Any]] = field(default_factory=list)

    def __iter__(self):
        return iter(self.results)

    def __len__(self) -> int:
        return len(self.results)

    def __getitem__(self, index: int) -> ConversionResult:
        return self.results[index]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total": self.total,
            "succeeded": self.succeeded,
            "failed": self.failed,
            "results": [r.to_dict() for r in self.results],
            "errors": self.errors,
        }

