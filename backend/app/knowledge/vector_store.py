"""
Vector store abstraction.

Defines the interface for storing and searching embedding vectors
alongside their metadata. All implementations must keep data local.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from app.knowledge.models import KnowledgeChunk


class VectorStoreResult:
    """A single result from a vector similarity search."""

    __slots__ = ("chunk_id", "score", "metadata")

    def __init__(
        self, chunk_id: str, score: float, metadata: dict[str, Any]
    ) -> None:
        self.chunk_id = chunk_id
        self.score = score
        self.metadata = metadata


class VectorStore(ABC):
    """Abstract vector store interface.

    All implementations must store vectors and metadata locally.
    No cloud vector databases permitted.
    """

    @abstractmethod
    def add(
        self,
        chunk_id: str,
        vector: np.ndarray,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Add a single vector with its chunk ID and optional metadata."""
        ...

    @abstractmethod
    def add_batch(
        self,
        chunk_ids: list[str],
        vectors: list[np.ndarray],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> None:
        """Add a batch of vectors."""
        ...

    @abstractmethod
    def search(
        self, query_vector: np.ndarray, top_k: int = 5
    ) -> list[VectorStoreResult]:
        """Search for the top_k most similar vectors.

        Returns results ordered by descending similarity score.
        """
        ...

    @abstractmethod
    def delete(self, chunk_id: str) -> bool:
        """Delete a vector by chunk ID. Returns True if found and deleted."""
        ...

    @abstractmethod
    def delete_by_document(self, document_id: str) -> int:
        """Delete all vectors belonging to a document.

        Returns the number of vectors deleted.
        """
        ...

    @abstractmethod
    def count(self) -> int:
        """Return the total number of stored vectors."""
        ...

    @abstractmethod
    def clear(self) -> None:
        """Remove all vectors from the store."""
        ...
