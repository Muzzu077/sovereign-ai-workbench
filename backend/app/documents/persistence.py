"""
Document metadata persistence.

SQLite-backed store for document metadata, enabling DocumentStore
to reconstruct its registry after a process restart without loading
large document bodies into memory.

Follows the same persistence pattern as KnowledgeMetadataStore:
- SQLite in WAL mode
- Parameterized queries only
- No document text/body stored (only metadata)
- Foreign key enforcement
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path

from app.documents.models import (
    Document,
    DocumentMetadata,
    DocumentPage,
    ExtractionStatus,
    FileType,
)

logger = logging.getLogger(__name__)

_SCHEMA_VERSION = 1

_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    document_id        TEXT PRIMARY KEY,
    filename           TEXT NOT NULL,
    file_type          TEXT NOT NULL,
    file_size          INTEGER NOT NULL DEFAULT 0,
    page_count         INTEGER NOT NULL DEFAULT 0,
    extraction_status  TEXT NOT NULL DEFAULT 'FAILED',
    text_length        INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL,
    stored_path        TEXT NOT NULL DEFAULT '',
    content_hash       TEXT NOT NULL DEFAULT '',
    original_filename  TEXT NOT NULL DEFAULT '',
    stored_filename    TEXT NOT NULL DEFAULT '',
    mime_type          TEXT NOT NULL DEFAULT '',
    encoding           TEXT,
    author             TEXT,
    title              TEXT,
    metadata_extra     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_documents_filename
    ON documents(filename);
CREATE INDEX IF NOT EXISTS idx_documents_content_hash
    ON documents(content_hash);
"""


class DocumentMetadataStore:
    """SQLite-backed persistent store for document metadata.

    Persists the essential fields needed to reconstruct Document
    objects after a process restart. Does NOT store document body
    text or page text — only metadata, status, and file references.

    Args:
        db_path: Path to the SQLite database file.
    """

    def __init__(self, db_path: Path | str) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(
            str(self._db_path),
            check_same_thread=False,
        )
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.row_factory = sqlite3.Row
        self._initialize_schema()

    def _initialize_schema(self) -> None:
        """Create tables if they do not exist."""
        self._conn.executescript(_CREATE_TABLES)
        self._conn.execute(
            "INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)",
            ("schema_version", str(_SCHEMA_VERSION)),
        )
        self._conn.commit()
        logger.info(
            "Document metadata store initialized: %s (schema v%d)",
            self._db_path,
            _SCHEMA_VERSION,
        )

    # ---- Document CRUD ----

    def save_document(
        self,
        document: Document,
        stored_path: str = "",
        content_hash: str = "",
    ) -> None:
        """Persist document metadata.

        Args:
            document: The Document model to persist.
            stored_path: Filesystem path where the uploaded file is stored.
            content_hash: Optional SHA-256 hash of document content.
        """
        meta = document.metadata
        self._conn.execute(
            """
            INSERT OR REPLACE INTO documents (
                document_id, filename, file_type, file_size,
                page_count, extraction_status, text_length,
                created_at, stored_path, content_hash,
                original_filename, stored_filename,
                mime_type, encoding, author, title, metadata_extra
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document.document_id,
                document.filename,
                document.file_type.value,
                document.file_size,
                document.page_count,
                document.extraction_status.value,
                len(document.text),
                document.created_at,
                stored_path,
                content_hash,
                meta.original_filename,
                meta.stored_filename,
                meta.mime_type,
                meta.encoding,
                meta.author,
                meta.title,
                json.dumps(meta.extra),
            ),
        )
        self._conn.commit()

    def get_document(self, document_id: str) -> dict | None:
        """Load document metadata by ID.

        Returns a dict with all persisted fields, or None if not found.
        Does NOT load document text — that must be re-extracted from
        the stored file if needed.
        """
        row = self._conn.execute(
            "SELECT * FROM documents WHERE document_id = ?",
            (document_id,),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def list_documents(self) -> list[dict]:
        """List all persisted document metadata records."""
        rows = self._conn.execute(
            "SELECT * FROM documents ORDER BY created_at DESC"
        ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def delete_document(self, document_id: str) -> bool:
        """Delete a document metadata record.

        Returns True if a record was deleted.
        """
        cursor = self._conn.execute(
            "DELETE FROM documents WHERE document_id = ?",
            (document_id,),
        )
        self._conn.commit()
        return cursor.rowcount > 0

    def update_stored_path(
        self, document_id: str, stored_path: str
    ) -> None:
        """Update the stored file path for a document."""
        self._conn.execute(
            "UPDATE documents SET stored_path = ? WHERE document_id = ?",
            (stored_path, document_id),
        )
        self._conn.commit()

    def document_count(self) -> int:
        """Return total number of persisted documents."""
        row = self._conn.execute(
            "SELECT COUNT(*) AS cnt FROM documents"
        ).fetchone()
        return row["cnt"]

    def close(self) -> None:
        """Close the database connection."""
        self._conn.close()
        logger.info("Document metadata store closed: %s", self._db_path)

    @property
    def db_path(self) -> Path:
        return self._db_path

    # ---- Reconstruction helpers ----

    def reconstruct_document(
        self, row_dict: dict, text: str = "", pages: list[DocumentPage] | None = None,
    ) -> Document:
        """Reconstruct a Document model from persisted metadata.

        Args:
            row_dict: Dict from get_document() or list_documents().
            text: Extracted text (empty string if not re-extracted).
            pages: Page list (empty if not re-extracted).

        Returns:
            A Document instance with persisted metadata.
        """
        return Document(
            document_id=row_dict["document_id"],
            filename=row_dict["filename"],
            file_type=FileType(row_dict["file_type"]),
            file_size=row_dict["file_size"],
            page_count=row_dict["page_count"],
            extraction_status=ExtractionStatus(row_dict["extraction_status"]),
            text=text,
            pages=pages or [],
            metadata=DocumentMetadata(
                original_filename=row_dict.get("original_filename", ""),
                stored_filename=row_dict.get("stored_filename", ""),
                mime_type=row_dict.get("mime_type", ""),
                encoding=row_dict.get("encoding"),
                author=row_dict.get("author"),
                title=row_dict.get("title"),
                extra=json.loads(row_dict.get("metadata_extra", "{}")),
            ),
            created_at=row_dict["created_at"],
        )

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        """Convert a SQLite row to a plain dict."""
        return dict(row)
