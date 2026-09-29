"""
SQLite persistence layer for knowledge metadata.

Stores KnowledgeDocument and KnowledgeChunk records in a local
SQLite database. Designed to survive application restarts and
process recreation.

No network dependencies. No cloud databases.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.knowledge.models import (
    EmbeddingConfig,
    IngestionStatus,
    KnowledgeChunk,
    KnowledgeDocument,
)

logger = logging.getLogger(__name__)

_SCHEMA_VERSION = 1

_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    document_id        TEXT PRIMARY KEY,
    filename           TEXT NOT NULL,
    file_type          TEXT NOT NULL,
    content_hash       TEXT NOT NULL DEFAULT '',
    chunk_count        INTEGER NOT NULL DEFAULT 0,
    ingestion_status   TEXT NOT NULL DEFAULT 'pending',
    embedding_provider TEXT NOT NULL DEFAULT '',
    embedding_version  INTEGER NOT NULL DEFAULT 0,
    chunking_version   INTEGER NOT NULL DEFAULT 1,
    ingested_at        TEXT,
    updated_at         TEXT,
    ingestion_time_ms  REAL NOT NULL DEFAULT 0.0,
    embedding_time_ms  REAL NOT NULL DEFAULT 0.0,
    error_info         TEXT,
    metadata_json      TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    chunk_id           TEXT PRIMARY KEY,
    document_id        TEXT NOT NULL,
    chunk_index        INTEGER NOT NULL DEFAULT 0,
    text               TEXT NOT NULL,
    page_number        INTEGER,
    section            TEXT,
    source             TEXT NOT NULL DEFAULT '',
    start_char         INTEGER NOT NULL DEFAULT 0,
    end_char           INTEGER NOT NULL DEFAULT 0,
    chunk_hash         TEXT NOT NULL DEFAULT '',
    vector_id          TEXT NOT NULL DEFAULT '',
    created_at         TEXT NOT NULL,
    metadata_json      TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_document
    ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_vector_id
    ON knowledge_chunks(vector_id);
CREATE INDEX IF NOT EXISTS idx_docs_content_hash
    ON knowledge_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_docs_status
    ON knowledge_documents(ingestion_status);

CREATE TABLE IF NOT EXISTS embedding_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class KnowledgeMetadataStore:
    """SQLite-backed persistent store for knowledge metadata.

    Thread-safety: each instance owns a single connection.
    For multi-threaded use, create separate instances or use
    connection pooling externally.
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

        # Record schema version
        self._conn.execute(
            "INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)",
            ("schema_version", str(_SCHEMA_VERSION)),
        )
        self._conn.commit()
        logger.info(
            "Knowledge metadata store initialized: %s (schema v%d)",
            self._db_path,
            _SCHEMA_VERSION,
        )

    # ---- Embedding configuration ----

    def save_embedding_config(self, config: EmbeddingConfig) -> None:
        """Persist the current embedding configuration."""
        self._conn.execute(
            "INSERT OR REPLACE INTO embedding_meta (key, value) VALUES (?, ?)",
            ("embedding_fingerprint", config.fingerprint()),
        )
        self._conn.execute(
            "INSERT OR REPLACE INTO embedding_meta (key, value) VALUES (?, ?)",
            ("embedding_provider", config.provider),
        )
        self._conn.execute(
            "INSERT OR REPLACE INTO embedding_meta (key, value) VALUES (?, ?)",
            ("embedding_version", str(config.version)),
        )
        self._conn.execute(
            "INSERT OR REPLACE INTO embedding_meta (key, value) VALUES (?, ?)",
            ("embedding_dimension", str(config.dimension)),
        )
        self._conn.execute(
            "INSERT OR REPLACE INTO embedding_meta (key, value) VALUES (?, ?)",
            ("embedding_model_name", config.model_name),
        )
        self._conn.commit()

    def load_embedding_fingerprint(self) -> str | None:
        """Load the stored embedding fingerprint, if any."""
        row = self._conn.execute(
            "SELECT value FROM embedding_meta WHERE key = ?",
            ("embedding_fingerprint",),
        ).fetchone()
        return row["value"] if row else None

    def is_embedding_compatible(self, config: EmbeddingConfig) -> bool:
        """Check whether the stored index matches the given config."""
        stored = self.load_embedding_fingerprint()
        if stored is None:
            return True  # No prior index — compatible by definition
        return stored == config.fingerprint()

    # ---- Document CRUD ----

    def save_document(self, doc: KnowledgeDocument) -> None:
        """Insert or replace a knowledge document record."""
        self._conn.execute(
            """
            INSERT OR REPLACE INTO knowledge_documents (
                document_id, filename, file_type, content_hash,
                chunk_count, ingestion_status,
                embedding_provider, embedding_version, chunking_version,
                ingested_at, updated_at,
                ingestion_time_ms, embedding_time_ms,
                error_info, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc.document_id,
                doc.filename,
                doc.file_type,
                doc.content_hash,
                doc.chunk_count,
                doc.ingestion_status.value,
                doc.embedding_provider,
                doc.embedding_version,
                doc.chunking_version,
                doc.ingested_at,
                doc.updated_at or datetime.now(timezone.utc).isoformat(),
                doc.ingestion_time_ms,
                doc.embedding_time_ms,
                doc.error_info,
                json.dumps(doc.metadata),
            ),
        )
        self._conn.commit()

    def get_document(self, document_id: str) -> KnowledgeDocument | None:
        """Load a knowledge document by ID."""
        row = self._conn.execute(
            "SELECT * FROM knowledge_documents WHERE document_id = ?",
            (document_id,),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_document(row)

    def find_by_content_hash(
        self, content_hash: str
    ) -> KnowledgeDocument | None:
        """Find a knowledge document by its content hash (alias for get_document_by_hash)."""
        return self.get_document_by_hash(content_hash)

    def get_document_by_hash(
        self, content_hash: str
    ) -> KnowledgeDocument | None:
        """Find a knowledge document by its content hash."""
        row = self._conn.execute(
            "SELECT * FROM knowledge_documents WHERE content_hash = ? LIMIT 1",
            (content_hash,),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_document(row)

    def list_documents(self) -> list[KnowledgeDocument]:
        """List all knowledge documents."""
        rows = self._conn.execute(
            "SELECT * FROM knowledge_documents ORDER BY ingested_at DESC"
        ).fetchall()
        return [self._row_to_document(r) for r in rows]

    def delete_document(self, document_id: str) -> bool:
        """Delete a document and its chunks (cascade)."""
        cursor = self._conn.execute(
            "DELETE FROM knowledge_documents WHERE document_id = ?",
            (document_id,),
        )
        self._conn.commit()
        return cursor.rowcount > 0

    def update_document_status(
        self,
        document_id: str,
        status: IngestionStatus,
        *,
        error_info: str | None = None,
        chunk_count: int | None = None,
        ingestion_time_ms: float | None = None,
        embedding_time_ms: float | None = None,
    ) -> None:
        """Update specific fields on a document record."""
        updates = ["ingestion_status = ?", "updated_at = ?"]
        params: list = [status.value, datetime.now(timezone.utc).isoformat()]

        if error_info is not None:
            updates.append("error_info = ?")
            params.append(error_info)
        if chunk_count is not None:
            updates.append("chunk_count = ?")
            params.append(chunk_count)
        if ingestion_time_ms is not None:
            updates.append("ingestion_time_ms = ?")
            params.append(ingestion_time_ms)
        if embedding_time_ms is not None:
            updates.append("embedding_time_ms = ?")
            params.append(embedding_time_ms)
        if status == IngestionStatus.INDEXED:
            updates.append("ingested_at = ?")
            params.append(datetime.now(timezone.utc).isoformat())

        params.append(document_id)
        sql = f"UPDATE knowledge_documents SET {', '.join(updates)} WHERE document_id = ?"
        self._conn.execute(sql, params)
        self._conn.commit()

    def mark_all_stale(self) -> int:
        """Mark all INDEXED documents as STALE (used on embedding config change)."""
        cursor = self._conn.execute(
            """
            UPDATE knowledge_documents
            SET ingestion_status = ?, updated_at = ?
            WHERE ingestion_status = ?
            """,
            (
                IngestionStatus.STALE.value,
                datetime.now(timezone.utc).isoformat(),
                IngestionStatus.INDEXED.value,
            ),
        )
        self._conn.commit()
        return cursor.rowcount

    # ---- Chunk CRUD ----

    def save_chunks(self, chunks: list[KnowledgeChunk]) -> None:
        """Batch insert/replace chunk records."""
        self._conn.executemany(
            """
            INSERT OR REPLACE INTO knowledge_chunks (
                chunk_id, document_id, chunk_index, text,
                page_number, section, source,
                start_char, end_char, chunk_hash, vector_id,
                created_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    c.chunk_id,
                    c.document_id,
                    c.chunk_index,
                    c.text,
                    c.page_number,
                    c.section,
                    c.source,
                    c.start_char,
                    c.end_char,
                    c.chunk_hash,
                    c.vector_id,
                    c.created_at,
                    json.dumps(c.metadata),
                )
                for c in chunks
            ],
        )
        self._conn.commit()

    def get_chunk(self, chunk_id: str) -> KnowledgeChunk | None:
        """Load a single chunk by ID."""
        row = self._conn.execute(
            "SELECT * FROM knowledge_chunks WHERE chunk_id = ?",
            (chunk_id,),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_chunk(row)

    def get_chunks_by_document(
        self, document_id: str
    ) -> list[KnowledgeChunk]:
        """Load all chunks for a document, ordered by chunk_index."""
        rows = self._conn.execute(
            "SELECT * FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index",
            (document_id,),
        ).fetchall()
        return [self._row_to_chunk(r) for r in rows]

    def delete_chunks_by_document(self, document_id: str) -> int:
        """Delete all chunks for a document."""
        cursor = self._conn.execute(
            "DELETE FROM knowledge_chunks WHERE document_id = ?",
            (document_id,),
        )
        self._conn.commit()
        return cursor.rowcount

    def chunk_count(self) -> int:
        """Count total chunks across all documents."""
        row = self._conn.execute(
            "SELECT COUNT(*) AS cnt FROM knowledge_chunks"
        ).fetchone()
        return row["cnt"]

    # ---- Helpers ----

    @staticmethod
    def _row_to_document(row: sqlite3.Row) -> KnowledgeDocument:
        """Convert a SQLite row to a KnowledgeDocument."""
        return KnowledgeDocument(
            document_id=row["document_id"],
            filename=row["filename"],
            file_type=row["file_type"],
            content_hash=row["content_hash"],
            chunk_count=row["chunk_count"],
            ingestion_status=IngestionStatus(row["ingestion_status"]),
            embedding_provider=row["embedding_provider"],
            embedding_version=row["embedding_version"],
            chunking_version=row["chunking_version"],
            ingested_at=row["ingested_at"],
            updated_at=row["updated_at"],
            ingestion_time_ms=row["ingestion_time_ms"],
            embedding_time_ms=row["embedding_time_ms"],
            error_info=row["error_info"],
            metadata=json.loads(row["metadata_json"]),
        )

    @staticmethod
    def _row_to_chunk(row: sqlite3.Row) -> KnowledgeChunk:
        """Convert a SQLite row to a KnowledgeChunk."""
        return KnowledgeChunk(
            chunk_id=row["chunk_id"],
            document_id=row["document_id"],
            chunk_index=row["chunk_index"],
            text=row["text"],
            page_number=row["page_number"],
            section=row["section"],
            source=row["source"],
            start_char=row["start_char"],
            end_char=row["end_char"],
            chunk_hash=row["chunk_hash"],
            vector_id=row["vector_id"],
            created_at=row["created_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    def close(self) -> None:
        """Close the database connection."""
        self._conn.close()
        logger.info("Knowledge metadata store closed: %s", self._db_path)

    @property
    def db_path(self) -> Path:
        return self._db_path
