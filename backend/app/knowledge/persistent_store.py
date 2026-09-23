"""
Persistent vector store with generation-consistent storage.

Stores embedding vectors as NumPy .npz files on the local filesystem
alongside JSON metadata. Uses a generation-based storage model to
ensure atomic updates and recovery from partial writes.

Architecture:
- Each save creates a new generation in generations/<generation-id>/
- A manifest.json in the storage root points to the current valid generation
- Previous valid generation is retained until a new one is confirmed
- Corruption is detected explicitly and never silently converted to empty

Health States:
- HEALTHY: Valid generation loaded successfully
- UNINITIALIZED: No generations exist yet (empty store)
- CORRUPTED: Storage files exist but are invalid/inconsistent
- REBUILD_REQUIRED: Manifest/data mismatch requiring re-indexing

No external databases. No network dependencies.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import time
from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np

from app.knowledge.vector_store import VectorStore, VectorStoreResult

logger = logging.getLogger(__name__)


class VectorStoreHealth(str, Enum):
    """Health states for the persistent vector store."""

    HEALTHY = "healthy"
    UNINITIALIZED = "uninitialized"
    CORRUPTED = "corrupted"
    REBUILD_REQUIRED = "rebuild_required"


class VectorStoreCorruptionError(Exception):
    """Raised when the vector store is in a corrupted state and cannot serve queries."""


# Filenames within a generation directory
_VECTORS_FILENAME = "vectors.npz"
_IDS_FILENAME = "ids.json"
_META_FILENAME = "metadata.json"
_MANIFEST_FILENAME = "manifest.json"

# Root manifest filename
_ROOT_MANIFEST = "manifest.json"

# Legacy filenames (v0.6.0 format)
_LEGACY_VECTORS = "vectors.npz"
_LEGACY_IDS = "ids.json"
_LEGACY_META = "metadata.json"
_LEGACY_CONFIG = "store_config.json"

_MANIFEST_SCHEMA_VERSION = 2


class PersistentVectorStore(VectorStore):
    """NumPy-file-backed vector store with generation-consistent storage.

    Vectors, IDs, and metadata are persisted using a generation model:
    each save creates a complete snapshot in a numbered generation
    directory. A root manifest points to the current valid generation.

    Corruption is detected explicitly and reported via health_status.
    Search on corrupted storage raises VectorStoreCorruptionError.

    Args:
        storage_dir: Directory for storing vector files.
        auto_save: If True, persist after every mutation (default True).
        expected_dimension: Expected embedding dimension for validation.
        embedding_fingerprint: Current embedding fingerprint for compatibility checks.
    """

    def __init__(
        self,
        storage_dir: Path | str,
        *,
        auto_save: bool = True,
        expected_dimension: int | None = None,
        embedding_fingerprint: str | None = None,
    ) -> None:
        self._storage_dir = Path(storage_dir)
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._auto_save = auto_save
        self._expected_dimension = expected_dimension
        self._embedding_fingerprint = embedding_fingerprint

        # In-memory working set
        self._ids: list[str] = []
        self._vectors: list[np.ndarray] = []
        self._metadatas: list[dict[str, Any]] = []
        self._id_index: dict[str, int] = {}

        # Health state
        self._health: VectorStoreHealth = VectorStoreHealth.UNINITIALIZED
        self._error_info: str | None = None
        self._current_generation: int = 0

        # Attempt to load existing persisted state
        self._load()

    # ---- Health ----

    @property
    def health_status(self) -> VectorStoreHealth:
        """Return the current health state of the vector store."""
        return self._health

    @property
    def error_info(self) -> str | None:
        """Return error details if the store is unhealthy."""
        return self._error_info

    @property
    def current_generation(self) -> int:
        """Return the current generation number."""
        return self._current_generation

    def _assert_healthy(self) -> None:
        """Raise if the store is not in a queryable state."""
        if self._health == VectorStoreHealth.CORRUPTED:
            raise VectorStoreCorruptionError(
                f"Vector store is corrupted and cannot serve queries. "
                f"Error: {self._error_info}. "
                f"Re-indexing or manual recovery required."
            )
        if self._health == VectorStoreHealth.REBUILD_REQUIRED:
            raise VectorStoreCorruptionError(
                f"Vector store requires rebuild. "
                f"Error: {self._error_info}. "
                f"Re-indexing required."
            )

    # ---- VectorStore interface ----

    def add(
        self,
        chunk_id: str,
        vector: np.ndarray,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self._assert_healthy_or_uninitialized()
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

        # Mark healthy once we have data
        if self._health == VectorStoreHealth.UNINITIALIZED:
            self._health = VectorStoreHealth.HEALTHY

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
        self._assert_healthy()

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
        self._assert_healthy_or_uninitialized()
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
        self._assert_healthy_or_uninitialized()
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
        self._health = VectorStoreHealth.UNINITIALIZED
        self._error_info = None
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

    # ---- Persistence (generation-based) ----

    def save(self) -> None:
        """Persist current state as a new generation.

        Creates a new generation directory with vectors, IDs, metadata,
        and a manifest. Only updates the root manifest after all files
        are successfully written. The previous valid generation is
        retained as a fallback.
        """
        new_gen = self._current_generation + 1
        gen_dir = self._generations_dir / f"generation-{new_gen:04d}"
        gen_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Write vectors
            if self._vectors:
                matrix = np.array(self._vectors)
                np.savez_compressed(
                    str(gen_dir / _VECTORS_FILENAME), vectors=matrix,
                )
                dimension = int(matrix.shape[1]) if matrix.ndim == 2 else 0
            else:
                dimension = 0

            # Write IDs
            ids_path = gen_dir / _IDS_FILENAME
            ids_path.write_text(json.dumps(self._ids), encoding="utf-8")

            # Write metadata
            meta_path = gen_dir / _META_FILENAME
            meta_path.write_text(
                json.dumps(self._metadatas), encoding="utf-8",
            )

            # Compute file checksums for integrity
            checksums = {}
            for fname in [_IDS_FILENAME, _META_FILENAME]:
                fpath = gen_dir / fname
                if fpath.exists():
                    checksums[fname] = hashlib.sha256(
                        fpath.read_bytes()
                    ).hexdigest()
            npz_path = gen_dir / _VECTORS_FILENAME
            if npz_path.exists():
                checksums[_VECTORS_FILENAME] = hashlib.sha256(
                    npz_path.read_bytes()
                ).hexdigest()

            # Write generation manifest
            gen_manifest = {
                "schema_version": _MANIFEST_SCHEMA_VERSION,
                "generation": new_gen,
                "vector_count": len(self._ids),
                "metadata_count": len(self._metadatas),
                "dimension": dimension,
                "embedding_fingerprint": self._embedding_fingerprint or "",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "checksums": checksums,
            }
            manifest_path = gen_dir / _MANIFEST_FILENAME
            manifest_path.write_text(
                json.dumps(gen_manifest, indent=2), encoding="utf-8",
            )

            # Atomic root manifest update
            root_manifest = {
                "current_generation": new_gen,
                "generation_dir": f"generation-{new_gen:04d}",
                "schema_version": _MANIFEST_SCHEMA_VERSION,
                "timestamp": gen_manifest["timestamp"],
            }
            root_manifest_path = self._storage_dir / _ROOT_MANIFEST
            tmp_root = root_manifest_path.with_suffix(".tmp")
            tmp_root.write_text(
                json.dumps(root_manifest, indent=2), encoding="utf-8",
            )
            tmp_root.rename(root_manifest_path)

            # Clean up old generations (keep previous + current)
            self._cleanup_old_generations(new_gen)

            self._current_generation = new_gen
            if self._ids:
                self._health = VectorStoreHealth.HEALTHY
            else:
                self._health = VectorStoreHealth.UNINITIALIZED
            self._error_info = None

        except Exception:
            logger.exception(
                "Failed to persist vector store generation %d to %s. "
                "Previous generation %d remains valid.",
                new_gen, self._storage_dir, self._current_generation,
            )
            # Clean up failed generation directory
            if gen_dir.exists():
                try:
                    shutil.rmtree(gen_dir)
                except OSError:
                    pass
            raise

    def _load(self) -> None:
        """Load persisted state from disk.

        Attempts to load from generation-based storage first,
        then falls back to legacy v0.6.0 flat-file format.
        """
        root_manifest_path = self._storage_dir / _ROOT_MANIFEST

        if root_manifest_path.exists():
            self._load_from_generations(root_manifest_path)
        elif self._has_legacy_files():
            self._migrate_legacy_format()
        else:
            logger.info(
                "No persisted vector store found at %s", self._storage_dir,
            )
            self._health = VectorStoreHealth.UNINITIALIZED

    def _load_from_generations(self, root_manifest_path: Path) -> None:
        """Load from generation-based storage."""
        try:
            root_data = json.loads(
                root_manifest_path.read_text(encoding="utf-8")
            )
        except (json.JSONDecodeError, OSError) as exc:
            self._mark_corrupted(
                f"Root manifest unreadable: {exc}"
            )
            return

        gen_dir_name = root_data.get("generation_dir", "")
        gen_number = root_data.get("current_generation", 0)
        gen_dir = self._generations_dir / gen_dir_name

        if not gen_dir.exists():
            # Try falling back to previous generation
            if gen_number > 1:
                prev_dir = self._generations_dir / f"generation-{gen_number - 1:04d}"
                if prev_dir.exists():
                    logger.warning(
                        "Current generation %d missing, falling back to %d",
                        gen_number, gen_number - 1,
                    )
                    gen_dir = prev_dir
                    gen_number = gen_number - 1
                else:
                    self._mark_corrupted(
                        f"Generation directory missing: {gen_dir_name}"
                    )
                    return
            else:
                self._mark_corrupted(
                    f"Generation directory missing: {gen_dir_name}"
                )
                return

        self._load_generation(gen_dir, gen_number)

    def _load_generation(self, gen_dir: Path, gen_number: int) -> None:
        """Load a specific generation from disk with full validation."""
        manifest_path = gen_dir / _MANIFEST_FILENAME
        ids_path = gen_dir / _IDS_FILENAME
        meta_path = gen_dir / _META_FILENAME
        npz_path = gen_dir / _VECTORS_FILENAME

        # Validate manifest exists
        if not manifest_path.exists():
            self._mark_corrupted(
                f"Generation {gen_number}: manifest.json missing"
            )
            return

        try:
            manifest = json.loads(
                manifest_path.read_text(encoding="utf-8")
            )
        except (json.JSONDecodeError, OSError) as exc:
            self._mark_corrupted(
                f"Generation {gen_number}: manifest unreadable: {exc}"
            )
            return

        expected_count = manifest.get("vector_count", 0)
        expected_meta_count = manifest.get("metadata_count", 0)
        expected_dimension = manifest.get("dimension", 0)
        stored_fingerprint = manifest.get("embedding_fingerprint", "")

        # Validate embedding fingerprint compatibility
        if (
            self._embedding_fingerprint
            and stored_fingerprint
            and stored_fingerprint != self._embedding_fingerprint
        ):
            self._mark_rebuild_required(
                f"Embedding fingerprint mismatch: stored={stored_fingerprint}, "
                f"expected={self._embedding_fingerprint}"
            )
            return

        # Validate file checksums if available
        checksums = manifest.get("checksums", {})
        for fname, expected_hash in checksums.items():
            fpath = gen_dir / fname
            if fpath.exists():
                actual_hash = hashlib.sha256(fpath.read_bytes()).hexdigest()
                if actual_hash != expected_hash:
                    self._mark_corrupted(
                        f"Generation {gen_number}: checksum mismatch for {fname}"
                    )
                    return
            elif expected_count > 0:
                self._mark_corrupted(
                    f"Generation {gen_number}: required file {fname} missing"
                )
                return

        # Load IDs
        if not ids_path.exists():
            if expected_count == 0:
                # Empty generation is valid
                self._current_generation = gen_number
                self._health = VectorStoreHealth.UNINITIALIZED
                return
            self._mark_corrupted(
                f"Generation {gen_number}: ids.json missing"
            )
            return

        try:
            self._ids = json.loads(ids_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            self._mark_corrupted(
                f"Generation {gen_number}: ids.json unreadable: {exc}"
            )
            return

        # Load metadata
        if meta_path.exists():
            try:
                self._metadatas = json.loads(
                    meta_path.read_text(encoding="utf-8")
                )
            except (json.JSONDecodeError, OSError) as exc:
                self._mark_corrupted(
                    f"Generation {gen_number}: metadata.json unreadable: {exc}"
                )
                return
        else:
            self._metadatas = [{} for _ in self._ids]

        # Load vectors
        if npz_path.exists():
            try:
                data = np.load(str(npz_path))
                matrix = data["vectors"]
                self._vectors = [matrix[i] for i in range(len(matrix))]
            except Exception as exc:
                self._mark_corrupted(
                    f"Generation {gen_number}: vectors.npz unreadable: {exc}"
                )
                return
        else:
            if expected_count > 0:
                self._mark_corrupted(
                    f"Generation {gen_number}: vectors.npz missing"
                )
                return
            self._vectors = []

        # Validate counts
        if len(self._ids) != len(self._vectors):
            self._mark_corrupted(
                f"Generation {gen_number}: ID count ({len(self._ids)}) "
                f"!= vector count ({len(self._vectors)})"
            )
            return

        if len(self._ids) != len(self._metadatas):
            self._mark_corrupted(
                f"Generation {gen_number}: ID count ({len(self._ids)}) "
                f"!= metadata count ({len(self._metadatas)})"
            )
            return

        if expected_count > 0 and len(self._ids) != expected_count:
            self._mark_corrupted(
                f"Generation {gen_number}: manifest count ({expected_count}) "
                f"!= actual count ({len(self._ids)})"
            )
            return

        if expected_meta_count > 0 and len(self._metadatas) != expected_meta_count:
            self._mark_corrupted(
                f"Generation {gen_number}: manifest metadata count "
                f"({expected_meta_count}) != actual ({len(self._metadatas)})"
            )
            return

        # Validate dimension
        if (
            self._expected_dimension
            and self._vectors
            and self._vectors[0].shape[0] != self._expected_dimension
        ):
            self._mark_rebuild_required(
                f"Dimension mismatch: stored={self._vectors[0].shape[0]}, "
                f"expected={self._expected_dimension}"
            )
            return

        if (
            expected_dimension > 0
            and self._vectors
            and self._vectors[0].shape[0] != expected_dimension
        ):
            self._mark_corrupted(
                f"Generation {gen_number}: manifest dimension "
                f"({expected_dimension}) != actual ({self._vectors[0].shape[0]})"
            )
            return

        # Rebuild index
        self._id_index = {cid: i for i, cid in enumerate(self._ids)}
        self._current_generation = gen_number
        self._health = VectorStoreHealth.HEALTHY if self._ids else VectorStoreHealth.UNINITIALIZED
        self._error_info = None

        logger.info(
            "Loaded %d vectors from generation %d at %s",
            len(self._ids), gen_number, self._storage_dir,
        )

    def _has_legacy_files(self) -> bool:
        """Check if legacy v0.6.0 flat-file format exists."""
        return (self._storage_dir / _LEGACY_IDS).exists()

    def _migrate_legacy_format(self) -> None:
        """Migrate from v0.6.0 flat-file format to generation-based storage."""
        logger.info(
            "Migrating v0.6.0 legacy vector store to generation format: %s",
            self._storage_dir,
        )

        ids_path = self._storage_dir / _LEGACY_IDS
        meta_path = self._storage_dir / _LEGACY_META
        npz_path = self._storage_dir / _LEGACY_VECTORS

        try:
            self._ids = json.loads(ids_path.read_text(encoding="utf-8"))

            if meta_path.exists():
                self._metadatas = json.loads(
                    meta_path.read_text(encoding="utf-8")
                )
            else:
                self._metadatas = [{} for _ in self._ids]

            if npz_path.exists():
                data = np.load(str(npz_path))
                matrix = data["vectors"]
                self._vectors = [matrix[i] for i in range(len(matrix))]
            else:
                self._vectors = []

            # Validate consistency
            if len(self._ids) != len(self._vectors):
                self._mark_corrupted(
                    f"Legacy format corrupted: {len(self._ids)} IDs "
                    f"but {len(self._vectors)} vectors"
                )
                return

            if len(self._ids) != len(self._metadatas):
                # Pad metadata like the old code did
                while len(self._metadatas) < len(self._ids):
                    self._metadatas.append({})

            self._id_index = {cid: i for i, cid in enumerate(self._ids)}
            self._health = VectorStoreHealth.HEALTHY if self._ids else VectorStoreHealth.UNINITIALIZED

            # Save as generation-1
            self._current_generation = 0
            self.save()

            # Remove legacy files after successful migration
            for legacy_file in [_LEGACY_IDS, _LEGACY_META, _LEGACY_VECTORS, _LEGACY_CONFIG]:
                legacy_path = self._storage_dir / legacy_file
                if legacy_path.exists():
                    legacy_path.unlink()

            logger.info(
                "Successfully migrated %d vectors to generation format",
                len(self._ids),
            )

        except Exception as exc:
            logger.exception("Legacy migration failed: %s", exc)
            self._mark_corrupted(f"Legacy migration failed: {exc}")

    def _mark_corrupted(self, reason: str) -> None:
        """Mark the store as corrupted without destroying data."""
        self._health = VectorStoreHealth.CORRUPTED
        self._error_info = reason
        self._ids.clear()
        self._vectors.clear()
        self._metadatas.clear()
        self._id_index.clear()
        logger.error("Vector store corrupted: %s", reason)

    def _mark_rebuild_required(self, reason: str) -> None:
        """Mark the store as requiring rebuild."""
        self._health = VectorStoreHealth.REBUILD_REQUIRED
        self._error_info = reason
        self._ids.clear()
        self._vectors.clear()
        self._metadatas.clear()
        self._id_index.clear()
        logger.error("Vector store rebuild required: %s", reason)

    def _assert_healthy_or_uninitialized(self) -> None:
        """Allow mutations on healthy or uninitialized stores."""
        if self._health in (
            VectorStoreHealth.CORRUPTED,
            VectorStoreHealth.REBUILD_REQUIRED,
        ):
            raise VectorStoreCorruptionError(
                f"Vector store is {self._health.value}: {self._error_info}. "
                f"Cannot accept mutations."
            )

    @property
    def _generations_dir(self) -> Path:
        """Return the generations subdirectory."""
        d = self._storage_dir / "generations"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _cleanup_old_generations(self, current_gen: int) -> None:
        """Remove old generations, keeping current and previous."""
        gen_dir = self._generations_dir
        keep = {
            f"generation-{current_gen:04d}",
            f"generation-{current_gen - 1:04d}",
        }
        try:
            for child in gen_dir.iterdir():
                if child.is_dir() and child.name not in keep:
                    shutil.rmtree(child)
        except OSError:
            pass  # Best-effort cleanup

    def get_health_info(self) -> dict[str, Any]:
        """Return detailed health information."""
        info: dict[str, Any] = {
            "status": self._health.value,
            "generation": self._current_generation,
            "vector_count": len(self._ids),
            "storage_dir": str(self._storage_dir),
        }
        if self._error_info:
            info["error"] = self._error_info
        if self._vectors and len(self._vectors) > 0:
            info["dimension"] = int(self._vectors[0].shape[0])
        if self._embedding_fingerprint:
            info["embedding_fingerprint"] = self._embedding_fingerprint
        return info

    def reset_for_rebuild(self) -> None:
        """Reset the store to allow re-indexing after corruption.

        Clears the in-memory state and sets health to UNINITIALIZED.
        Does NOT delete persisted corrupted files (preserved for diagnosis).
        """
        self._ids.clear()
        self._vectors.clear()
        self._metadatas.clear()
        self._id_index.clear()
        self._health = VectorStoreHealth.UNINITIALIZED
        self._error_info = None
        self._current_generation = self._current_generation  # Keep generation counter
        logger.info("Vector store reset for rebuild")

    @property
    def storage_dir(self) -> Path:
        return self._storage_dir
