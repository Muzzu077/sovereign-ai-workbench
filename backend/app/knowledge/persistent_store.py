"""
Persistent vector store.

Stores embedding vectors as NumPy .npz files on the local filesystem
alongside a SQLite metadata index for chunk-to-vector mapping.
Supports full restart recovery.

Architecture:
- Vectors stored in a single .npz file per save cycle
- Chunk IDs and metadata stored in parallel arrays
- On load, vectors are memory-mapped where practical
- Cosine similarity search identical to InMemoryVectorStore

No external databases. No network dependencies.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import numpy as np

from app.knowledge.vector_store import VectorStore, VectorStoreResult

logger = logging.getLogger(__name__)

_VECTORS_FILENAME = "vectors.npz"
_IDS_FILENAME = "ids.json"
_META_FILENAME = "metadata.json"
_CONFIG_FILENAME = "store_config.json"


class PersistentVectorStore(VectorStore):
    """NumPy-file-backed vector store with cosine similarity search.

    Vectors, IDs, and metadata are persisted to the local filesystem.
    The store can be reopened after process restart and will recover
    its full state.

    Args:
        storage_dir: Directory for storing vector files.
        auto_save: If True, persist after every mutation (default True).
    """

    def __init__(
        self,
        storage_dir: Path | str,
        *,
        auto_save: bool = True,
    ) -> None:
        self._storage_dir = Path(storage_dir)
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._auto_save = auto_save

        # In-memory working set
        self._ids: list[str] = []
        self._vectors: list[np.ndarray] = []
        self._metadatas: list[dict[str, Any]] = []
        self._id_index: dict[str, int] = {}

        # Attempt to load existing persisted state
        self._load()

    # ---- VectorStore interface ----

    def add(
        self,
        chunk_id: str,
        vector: np.ndarray,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        vec = vector.astype(np.float64)
        if chunk_id in self._id_index:
            idx = self._id_index[chunk_id]
            self._vectors[idx] = vec
            if metadata is not None:
                self._metadatas[idx] = metadata
        else:
            idx = len(self._ids)
            self._ids.append(chunk_id)
            self._vectors.append(vec)
            self._metadatas.append(metadata or {})
            self._id_index[chunk_id] = idx

        if self._auto_save:
            self.save()

    def add_batch(
        self,
        chunk_ids: list[str],
        vectors: list[np.ndarray],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> None:
        if metadatas is None:
            metadatas = [{} for _ in chunk_ids]
        # Temporarily disable auto-save for batch efficiency
        was_auto = self._auto_save
        self._auto_save = False
        try:
            for cid, vec, meta in zip(chunk_ids, vectors, metadatas):
                self.add(cid, vec, meta)
        finally:
            self._auto_save = was_auto
        if self._auto_save:
            self.save()

    def search(
        self, query_vector: np.ndarray, top_k: int = 5
    ) -> list[VectorStoreResult]:
        if not self._vectors:
            return []

        query = query_vector.astype(np.float64)
        query_norm = np.linalg.norm(query)
        if query_norm == 0:
            return []

        matrix = np.array(self._vectors)
        norms = np.linalg.norm(matrix, axis=1)

        valid_mask = norms > 0
        similarities = np.zeros(len(matrix))
        if valid_mask.any():
            similarities[valid_mask] = (
                matrix[valid_mask] @ query
            ) / (norms[valid_mask] * query_norm)

        k = min(top_k, len(similarities))
        top_indices = np.argsort(similarities)[::-1][:k]

        results: list[VectorStoreResult] = []
        for idx in top_indices:
            score = float(similarities[idx])
            if score <= 0:
                continue
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
        self._ids.pop(idx)
        self._vectors.pop(idx)
        self._metadatas.pop(idx)
        del self._id_index[chunk_id]
        self._id_index = {cid: i for i, cid in enumerate(self._ids)}
        if self._auto_save:
            self.save()
        return True

    def delete_by_document(self, document_id: str) -> int:
        to_remove = [
            cid
            for cid, meta in zip(self._ids, self._metadatas)
            if meta.get("document_id") == document_id
        ]
        was_auto = self._auto_save
        self._auto_save = False
        try:
            for cid in to_remove:
                self.delete(cid)
        finally:
            self._auto_save = was_auto
        if was_auto and to_remove:
            self.save()
        return len(to_remove)

    def count(self) -> int:
        return len(self._ids)

    def clear(self) -> None:
        self._ids.clear()
        self._vectors.clear()
        self._metadatas.clear()
        self._id_index.clear()
        if self._auto_save:
            self.save()

    def has(self, chunk_id: str) -> bool:
        """Check if a chunk ID exists in the store."""
        return chunk_id in self._id_index

    def get_metadata(self, chunk_id: str) -> dict[str, Any] | None:
        """Get metadata dictionary for a given chunk ID if it exists."""
        idx = self._id_index.get(chunk_id)
        if idx is None:
            return None
        return self._metadatas[idx]

    # ---- Persistence ----

    def save(self) -> None:
        """Persist current state to disk."""
        try:
            # Save vectors
            if self._vectors:
                matrix = np.array(self._vectors)
                np.savez_compressed(
                    str(self._storage_dir / _VECTORS_FILENAME), vectors=matrix
                )
            else:
                npz_path = self._storage_dir / _VECTORS_FILENAME
                if npz_path.exists():
                    npz_path.unlink()

            # Save IDs
            ids_path = self._storage_dir / _IDS_FILENAME
            ids_path.write_text(json.dumps(self._ids), encoding="utf-8")

            # Save metadata
            meta_path = self._storage_dir / _META_FILENAME
            meta_path.write_text(
                json.dumps(self._metadatas), encoding="utf-8"
            )

            # Save store config (for corruption detection)
            config_path = self._storage_dir / _CONFIG_FILENAME
            config_path.write_text(
                json.dumps(
                    {
                        "count": len(self._ids),
                        "dimension": (
                            self._vectors[0].shape[0] if self._vectors else 0
                        ),
                    }
                ),
                encoding="utf-8",
            )
        except Exception:
            logger.exception("Failed to persist vector store to %s", self._storage_dir)
            raise

    def _load(self) -> None:
        """Load persisted state from disk if available."""
        ids_path = self._storage_dir / _IDS_FILENAME
        meta_path = self._storage_dir / _META_FILENAME
        npz_path = self._storage_dir / _VECTORS_FILENAME

        # Check if all files exist
        if not ids_path.exists():
            logger.info("No persisted vector store found at %s", self._storage_dir)
            return

        try:
            # Load IDs
            self._ids = json.loads(ids_path.read_text(encoding="utf-8"))

            # Load metadata
            if meta_path.exists():
                self._metadatas = json.loads(
                    meta_path.read_text(encoding="utf-8")
                )
            else:
                self._metadatas = [{} for _ in self._ids]

            # Load vectors
            if npz_path.exists():
                data = np.load(str(npz_path))
                matrix = data["vectors"]
                self._vectors = [matrix[i] for i in range(len(matrix))]
            else:
                self._vectors = []

            # Validate consistency
            if len(self._ids) != len(self._vectors):
                logger.error(
                    "Vector store corrupted: %d IDs but %d vectors. "
                    "Clearing store.",
                    len(self._ids),
                    len(self._vectors),
                )
                self._ids.clear()
                self._vectors.clear()
                self._metadatas.clear()
                self._id_index.clear()
                return

            if len(self._ids) != len(self._metadatas):
                logger.warning(
                    "Metadata count mismatch (%d vs %d IDs). "
                    "Filling missing metadata with empty dicts.",
                    len(self._metadatas),
                    len(self._ids),
                )
                while len(self._metadatas) < len(self._ids):
                    self._metadatas.append({})

            # Rebuild index
            self._id_index = {cid: i for i, cid in enumerate(self._ids)}

            logger.info(
                "Loaded %d vectors from %s",
                len(self._ids),
                self._storage_dir,
            )

        except Exception:
            logger.exception(
                "Failed to load vector store from %s. Starting empty.",
                self._storage_dir,
            )
            self._ids.clear()
            self._vectors.clear()
            self._metadatas.clear()
            self._id_index.clear()

    @property
    def storage_dir(self) -> Path:
        return self._storage_dir
