"""
Document processor abstraction.

Defines the ``DocumentProcessor`` interface and a registry that maps
file extensions to their concrete processor implementations.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from pathlib import Path

from app.documents.models import Document

logger = logging.getLogger(__name__)


class ProcessingError(Exception):
    """Raised when document processing fails in a controlled manner."""


class DocumentProcessor(ABC):
    """Abstract base class for document processors.

    Every supported file type (TXT, PDF, DOCX) has a concrete subclass
    that knows how to extract text and build a normalized ``Document``.
    """

    @property
    @abstractmethod
    def supported_extensions(self) -> list[str]:
        """File extensions this processor handles (without dot)."""
        ...

    @abstractmethod
    def process(
        self,
        file_path: Path,
        document_id: str,
        *,
        max_pages: int = 200,
        max_characters: int = 500_000,
    ) -> Document:
        """Extract text and build a normalized Document.

        Args:
            file_path:       Path to the file on disk.
            document_id:     Pre-generated unique identifier.
            max_pages:       Maximum number of pages to process.
            max_characters:  Maximum total characters to extract.

        Returns:
            A fully populated ``Document`` instance.

        Raises:
            ProcessingError: On any controlled failure.
        """
        ...


class ProcessorRegistry:
    """Maps file extensions to their ``DocumentProcessor`` instances.

    Usage::

        reg = ProcessorRegistry()
        reg.register(TxtProcessor())
        processor = reg.get("txt")
        doc = processor.process(path, doc_id)
    """

    def __init__(self) -> None:
        self._processors: dict[str, DocumentProcessor] = {}

    def register(self, processor: DocumentProcessor) -> None:
        """Register a processor for all its supported extensions."""
        for ext in processor.supported_extensions:
            key = ext.lower().lstrip(".")
            if key in self._processors:
                raise ValueError(
                    f"Extension '{key}' already registered to "
                    f"{type(self._processors[key]).__name__}"
                )
            self._processors[key] = processor

    def get(self, extension: str) -> DocumentProcessor:
        """Look up the processor for a file extension.

        Args:
            extension: File extension without the leading dot.

        Raises:
            KeyError: If no processor is registered for the extension.
        """
        key = extension.lower().lstrip(".")
        if key not in self._processors:
            raise KeyError(
                f"No processor registered for extension '.{key}'. "
                f"Supported: {list(self._processors.keys())}"
            )
        return self._processors[key]

    def has(self, extension: str) -> bool:
        return extension.lower().lstrip(".") in self._processors

    def list_extensions(self) -> list[str]:
        return sorted(self._processors.keys())
