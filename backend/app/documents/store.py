"""
Document store.

Manages the lifecycle of uploaded documents: storage on disk,
metadata tracking, and retrieval by ID.  Uses a simple in-memory
index (dict) backed by filesystem storage.

This is intentionally kept simple — a database-backed store can
replace the in-memory dict in a future phase without changing the
public interface.
"""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path

from app.documents.models import Document

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
    """In-memory document store with filesystem backing.

    Documents are indexed by ``document_id``. Uploaded files are
    stored in ``upload_dir`` under a UUID-prefixed subdirectory
    to avoid collisions.
    """

    def __init__(self, upload_dir: Path) -> None:
        self._upload_dir = upload_dir.resolve()
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._documents: dict[str, Document] = {}
        self._file_paths: dict[str, Path] = {}

    @property
    def upload_dir(self) -> Path:
        return self._upload_dir

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
        """Save a Document to the in-memory index."""
        self._documents[document.document_id] = document

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
        return True

    def update_document(self, document: Document) -> None:
        """Replace the stored document with an updated copy."""
        self._documents[document.document_id] = document
