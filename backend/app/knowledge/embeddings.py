"""
Embedding provider abstraction.

Defines the interface that every embedding provider must implement.
This ensures the system can switch between different local embedding
approaches (TF-IDF, sentence-transformers, ONNX models, etc.) without
changing downstream code.

No embedding provider may call external APIs.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np


class EmbeddingProvider(ABC):
    """Abstract base class for all embedding providers.

    Every implementation must produce embeddings locally — no cloud
    APIs, no external network calls.
    """

    @abstractmethod
    def embed(self, text: str) -> np.ndarray:
        """Embed a single text string into a vector.

        Args:
            text: The input text to embed.

        Returns:
            A 1-D numpy array representing the embedding.
        """
        ...

    @abstractmethod
    def embed_batch(self, texts: list[str]) -> list[np.ndarray]:
        """Embed a batch of text strings.

        Args:
            texts: List of input texts.

        Returns:
            List of 1-D numpy arrays, one per input text.
        """
        ...

    @abstractmethod
    def dimension(self) -> int:
        """Return the dimensionality of the embedding vectors."""
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Return the name of this embedding provider."""
        ...
