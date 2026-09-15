"""
Document store.

Manages the lifecycle of uploaded documents: storage on disk,
metadata tracking, and retrieval by ID.  Uses a SQLite-backed
metadata store for restart safety, with filesystem storage for
the actual document files.

The in-memory index is reconstructed from SQLite on startup.
Document text is NOT loaded into memory on restart — only
metadata is restored from persistence.
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid
from pathlib import Path

from app.documents.models import Document
from app.documents.persistence import DocumentMetadataStore

logger = logging.getLogger(__name__)

# Characters allowed in sanitized filenames
_SAFE_CHAR = re.compile(r"[^a-zA-Z0-9._-]")


def sanitize_filename(filename: str) -> str:
    """Sanitize a user-supplied filename for safe storage.

    - Strips leading/trailing whitespace and path separators
    - Replaces unsafe characters with underscores
    - Collapses consecutive underscores
    - Limits length to 255 characters
    - Falls back to ``"unnamed"`` if nothing is left
    """
    name = filename.strip().replace("\\", "/")
    # Take only the final path component
    name = name.rsplit("/", maxsplit=1)[-1]
    name = _SAFE_CHAR.sub("_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "unnamed"
    return name[:255]


class DocumentStore:
    """Persistent document store with filesystem file storage.

    Documents are indexed by ``document_id``. Uploaded files are
    stored in ``upload_dir`` under a UUID-prefixed subdirectory
    to avoid collisions.

    Metadata is persisted to SQLite so that the document registry
    survives process restarts. Document text bodies are NOT stored
    in SQLite — only metadata and file references.

    Args:
        upload_dir: Directory for storing uploaded files.
        metadata_store: Optional SQLite persistence for document metadata.
    """

    def __init__(
        self,
        upload_dir: Path,
        metadata_store: DocumentMetadataStore | None = None,
    ) -> None:
        self._upload_dir = upload_dir.resolve()
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._documents: dict[str, Document] = {}
        self._file_paths: dict[str, Path] = {}
        self._meta_store = metadata_store

        # Reconstruct from persistence
        if self._meta_store is not None:
            self._load_from_persistence()

    @property
    def upload_dir(self) -> Path:
        return self._upload_dir

    @property
    def metadata_store(self) -> DocumentMetadataStore | None:
        return self._meta_store

    def generate_id(self) -> str:
        """Generate a unique document ID."""
        return str(uuid.uuid4())

    def store_file(self, document_id: str, filename: str, content: bytes) -> Path:
        """Write uploaded file content to disk.

        Args:
            document_id: Pre-generated document ID.
            filename:    Sanitized filename.
            content:     Raw file bytes.

        Returns:
            The path where the file was stored.
        """
        doc_dir = self._upload_dir / document_id
        doc_dir.mkdir(parents=True, exist_ok=True)
        file_path = doc_dir / filename
        file_path.write_bytes(content)
        self._file_paths[document_id] = file_path
        return file_path

    def save_document(self, document: Document) -> None:
        """Save a Document to the in-memory index and persistence."""
        self._documents[document.document_id] = document

        if self._meta_store is not None:
            stored_path = ""
            fp = self._file_paths.get(document.document_id)
            if fp is not None:
                stored_path = str(fp)
            content_hash = ""
            if document.text:
                content_hash = hashlib.sha256(
                    document.text.encode("utf-8")
                ).hexdigest()
            self._meta_store.save_document(
                document,
                stored_path=stored_path,
                content_hash=content_hash,
            )

    def get_document(self, document_id: str) -> Document | None:
        """Retrieve a document by ID, or None if not found."""
        return self._documents.get(document_id)

    def get_file_path(self, document_id: str) -> Path | None:
        """Return the on-disk path for a document's file."""
        return self._file_paths.get(document_id)

    def list_documents(self) -> list[Document]:
        """Return all stored documents."""
        return list(self._documents.values())

    def delete_document(self, document_id: str) -> bool:
        """Delete a document and its file from storage.

        Returns True if the document existed and was deleted.
        """
        if document_id not in self._documents:
            return False

        # Remove file from disk
        file_path = self._file_paths.pop(document_id, None)
        if file_path and file_path.exists():
            file_path.unlink()
        # Remove the directory if empty
        doc_dir = self._upload_dir / document_id
        if doc_dir.exists():
            try:
                doc_dir.rmdir()
            except OSError:
                pass  # Directory not empty or other issue

        del self._documents[document_id]

        # Remove from persistence
        if self._meta_store is not None:
            self._meta_store.delete_document(document_id)

        return True

    def update_document(self, document: Document) -> None:
        """Replace the stored document with an updated copy."""
        self._documents[document.document_id] = document

        if self._meta_store is not None:
            stored_path = ""
            fp = self._file_paths.get(document.document_id)
            if fp is not None:
                stored_path = str(fp)
            content_hash = ""
            if document.text:
                content_hash = hashlib.sha256(
                    document.text.encode("utf-8")
                ).hexdigest()
            self._meta_store.save_document(
                document,
                stored_path=stored_path,
                content_hash=content_hash,
            )

    def is_file_available(self, document_id: str) -> bool:
        """Check whether the physical file for a document still exists on disk."""
        fp = self._file_paths.get(document_id)
        if fp is None:
            return False
        return fp.exists()

    def get_document_health(self, document_id: str) -> str:
        """Return the health status of a document.

        Returns:
            "healthy"       - metadata and file both present
            "missing_file"  - metadata exists but file is missing
            "not_found"     - document not in registry
        """
        if document_id not in self._documents:
            return "not_found"
        if not self.is_file_available(document_id):
            return "missing_file"
        return "healthy"

    def document_count(self) -> int:
        """Return the total number of documents in the registry."""
        return len(self._documents)

    def get_store_health(self) -> dict:
        """Return overall store health summary."""
        total = len(self._documents)
        missing = sum(
            1 for did in self._documents
            if not self.is_file_available(did)
        )
        return {
            "status": "healthy" if missing == 0 else "degraded",
            "total_documents": total,
            "missing_files": missing,
            "available_documents": total - missing,
        }

    def _load_from_persistence(self) -> None:
        """Reconstruct the document registry from SQLite persistence.

        Restores metadata and file path references. Does NOT load
        large document text bodies into memory.
        """
        assert self._meta_store is not None
        rows = self._meta_store.list_documents()

        for row_dict in rows:
            doc_id = row_dict["document_id"]
            stored_path = row_dict.get("stored_path", "")

            # Reconstruct document with empty text (not loaded from persistence)
            doc = self._meta_store.reconstruct_document(row_dict, text="", pages=[])
            self._documents[doc_id] = doc

            # Restore file path reference
            if stored_path:
                fp = Path(stored_path)
                if fp.exists():
                    self._file_paths[doc_id] = fp
                else:
                    # File missing — record path but note the issue
                    self._file_paths[doc_id] = fp
                    logger.warning(
                        "Document %s: stored file missing at %s "
                        "(metadata preserved for diagnosis)",
                        doc_id,
                        stored_path,
                    )
            else:
                # Try to discover file from upload directory structure
                doc_dir = self._upload_dir / doc_id
                if doc_dir.exists():
                    files = list(doc_dir.iterdir())
                    if files:
                        self._file_paths[doc_id] = files[0]

        logger.info(
            "Reconstructed %d documents from persistence",
            len(self._documents),
        )
