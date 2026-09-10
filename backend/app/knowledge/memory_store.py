"""
In-memory vector store.

A simple but functional vector store that keeps all vectors in
numpy arrays. Uses cosine similarity for search.

Suitable for development and small-to-medium knowledge bases
(up to ~100k chunks). For larger deployments, swap in a more
efficient implementation (FAISS, Annoy, etc.) using the same
VectorStore interface.

All data remains in-process memory — no external databases,
no network calls.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from app.knowledge.vector_store import VectorStore, VectorStoreResult

logger = logging.getLogger(__name__)


class InMemoryVectorStore(VectorStore):
    """Numpy-based in-memory vector store with cosine similarity search."""

    def __init__(self) -> None:
        self._ids: list[str] = []
        self._vectors: list[np.ndarray] = []
        self._metadatas: list[dict[str, Any]] = []
        self._id_index: dict[str, int] = {}  # chunk_id -> position

    def add(
        self,
        chunk_id: str,
        vector: np.ndarray,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if chunk_id in self._id_index:
            # Update existing entry
            idx = self._id_index[chunk_id]
            self._vectors[idx] = vector.astype(np.float64)
            if metadata is not None:
                self._metadatas[idx] = metadata
            return

        idx = len(self._ids)
        self._ids.append(chunk_id)
        self._vectors.append(vector.astype(np.float64))
        self._metadatas.append(metadata or {})
        self._id_index[chunk_id] = idx

    def add_batch(
        self,
        chunk_ids: list[str],
        vectors: list[np.ndarray],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> None:
        if metadatas is None:
            metadatas = [{} for _ in chunk_ids]
        for cid, vec, meta in zip(chunk_ids, vectors, metadatas):
            self.add(cid, vec, meta)

    def search(
        self, query_vector: np.ndarray, top_k: int = 5
    ) -> list[VectorStoreResult]:
        if not self._vectors:
            return []

        query = query_vector.astype(np.float64)
        query_norm = np.linalg.norm(query)
        if query_norm == 0:
            return []

        # Stack all vectors into a matrix for vectorized cosine similarity
        matrix = np.array(self._vectors)
        norms = np.linalg.norm(matrix, axis=1)

        # Avoid division by zero
        valid_mask = norms > 0
        similarities = np.zeros(len(matrix))
        if valid_mask.any():
            similarities[valid_mask] = (
                matrix[valid_mask] @ query
            ) / (norms[valid_mask] * query_norm)

        # Get top-k indices (descending similarity)
        k = min(top_k, len(similarities))
        top_indices = np.argsort(similarities)[::-1][:k]

        results: list[VectorStoreResult] = []
        for idx in top_indices:
            score = float(similarities[idx])
            if score <= 0:
                continue  # Skip non-positive similarities
            results.append(
                VectorStoreResult(
                    chunk_id=self._ids[idx],
                    score=score,
                    metadata=self._metadatas[idx],
                )
            )

        return results

    def delete(self, chunk_id: str) -> bool:
        if chunk_id not in self._id_index:
            return False
        idx = self._id_index[chunk_id]
        # Remove and rebuild index
        self._ids.pop(idx)
        self._vectors.pop(idx)
        self._metadatas.pop(idx)
        del self._id_index[chunk_id]
        # Rebuild position index
        self._id_index = {cid: i for i, cid in enumerate(self._ids)}
        return True

    def delete_by_document(self, document_id: str) -> int:
        to_remove = [
            cid
            for cid, meta in zip(self._ids, self._metadatas)
            if meta.get("document_id") == document_id
        ]
        for cid in to_remove:
            self.delete(cid)
        return len(to_remove)

    def count(self) -> int:
        return len(self._ids)

    def clear(self) -> None:
        self._ids.clear()
        self._vectors.clear()
        self._metadatas.clear()
        self._id_index.clear()

    def has(self, chunk_id: str) -> bool:
        """Check if a chunk ID exists in the store."""
        return chunk_id in self._id_index
