"""Abstract base class for all conversion backends."""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict

from image_converter.models import ConversionResult, FormatInfo


class BaseBackend(ABC):
    """Abstract interface that all conversion backends must implement."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the backend."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if backend dependencies are installed and available."""
        pass

    @abstractmethod
    def can_handle_output(self, format_info: FormatInfo) -> bool:
        """Return True if backend can write to the requested format."""
        pass

    @abstractmethod
    def convert(
        self,
        input_path: Path,
        output_path: Path,
        target_format: str,
        options: Dict[str, Any],
    ) -> ConversionResult:
        pass

