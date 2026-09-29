"""
Knowledge ingestion service.

Orchestrates the full ingestion pipeline:

    Document -> Chunk -> Embed -> Vector Store -> Persist

Reuses the existing Document Intelligence subsystem for document
retrieval. Does not reimplement PDF/DOCX/OCR processing.

Features:
- Ingests existing normalized documents from the document store.
- Content-hash-based duplicate detection.
- Supports re-indexing (deletes old chunks, re-indexes).
- Preserves document/chunk relationships.
- Records ingestion status and timing.
- Transactional failure recovery — partial failures do not
  produce false INDEXED state.
- Persists all metadata to SQLite via KnowledgeMetadataStore.
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone

from app.documents.models import Document, ExtractionStatus
from app.knowledge.chunking import ChunkingService
from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.models import (
    EmbeddingConfig,
    IngestionStatus,
    KnowledgeChunk,
    KnowledgeDocument,
)
from app.knowledge.persistence import KnowledgeMetadataStore
from app.knowledge.vector_store import VectorStore

logger = logging.getLogger(__name__)


class IngestionError(Exception):
    """Raised when document ingestion fails."""


def _compute_content_hash(text: str) -> str:
    """SHA-256 hash of document text for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _compute_chunk_hash(text: str) -> str:
    """SHA-256 hash of chunk text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


class KnowledgeIngestionService:
    """Orchestrates document ingestion into the knowledge base.

    Args:
        chunking_service: Splits documents into chunks.
        embedding_provider: Produces embeddings for chunks.
        vector_store: Stores and indexes embeddings.
        metadata_store: Optional SQLite persistence for metadata.
        embedding_config: Embedding configuration for version tracking.
    """

    def __init__(
        self,
        chunking_service: ChunkingService,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore,
        metadata_store: KnowledgeMetadataStore | None = None,
        embedding_config: EmbeddingConfig | None = None,
    ) -> None:
        self._chunker = chunking_service
        self._embedder = embedding_provider
        self._store = vector_store
        self._meta_store = metadata_store
        self._embedding_config = embedding_config or embedding_provider.get_config()

        # In-memory caches (populated from persistence on startup)
        self._documents: dict[str, KnowledgeDocument] = {}
        self._chunks: dict[str, KnowledgeChunk] = {}

        # Load from persistence if available
        if self._meta_store is not None:
            self._load_from_persistence()

    def _load_from_persistence(self) -> None:
        """Populate in-memory caches and refit embedding vocabulary from persistent store."""
        assert self._meta_store is not None
        for doc in self._meta_store.list_documents():
            self._documents[doc.document_id] = doc
            for chunk in self._meta_store.get_chunks_by_document(doc.document_id):
                self._chunks[chunk.chunk_id] = chunk

        # Fit embedding provider on loaded chunk texts so query embedding works across restarts
        if self._chunks and hasattr(self._embedder, "fit"):
            texts = [c.text for c in self._chunks.values()]
            try:
                self._embedder.fit(texts)  # type: ignore[attr-defined]
            except Exception as exc:
                logger.warning("Failed to refit embedding provider on restart: %s", exc)

        logger.info(
            "Loaded %d documents and %d chunks from persistence",
            len(self._documents),
            len(self._chunks),
        )

    @property
    def documents(self) -> dict[str, KnowledgeDocument]:
        return self._documents

    @property
    def embedding_config(self) -> EmbeddingConfig:
        return self._embedding_config

    def get_chunk(self, chunk_id: str) -> KnowledgeChunk | None:
        """Retrieve a chunk by its ID."""
        return self._chunks.get(chunk_id)

    def get_document(self, document_id: str) -> KnowledgeDocument | None:
        """Retrieve a knowledge document record by document ID."""
        return self._documents.get(document_id)

    def list_documents(self) -> list[KnowledgeDocument]:
        """List all ingested knowledge documents."""
        return list(self._documents.values())

    def is_ingested(self, document_id: str) -> bool:
        """Check if a document has already been successfully ingested."""
        doc = self._documents.get(document_id)
        return doc is not None and doc.ingestion_status == IngestionStatus.INDEXED

    def ingest(
        self,
        document: Document,
        *,
        force: bool = False,
    ) -> KnowledgeDocument:
        """Ingest a normalized document into the knowledge base.

        Args:
            document: A Document from the document intelligence subsystem.
            force: If True, re-index even if already ingested.

        Returns:
            KnowledgeDocument with ingestion status and timing.
        """
        doc_id = document.document_id
        total_start = time.monotonic()
        content_hash = _compute_content_hash(document.text)

        # Check if already ingested with same content
        if self.is_ingested(doc_id) and not force:
            existing = self._documents[doc_id]
            if existing.content_hash == content_hash:
                logger.info("Document %s already ingested (same hash) — skipping", doc_id)
                return existing
            # Different content — mark as stale and re-ingest
            logger.info("Document %s content changed — re-ingesting", doc_id)

        # Clean up if re-indexing
        if doc_id in self._documents:
            self._remove_document_chunks(doc_id)

        # Create initial PROCESSING record
        knowledge_doc = KnowledgeDocument(
            document_id=doc_id,
            filename=document.filename,
            file_type=document.file_type.value,
            content_hash=content_hash,
            ingestion_status=IngestionStatus.PROCESSING,
            embedding_provider=self._embedding_config.provider,
            embedding_version=self._embedding_config.version,
        )
        self._documents[doc_id] = knowledge_doc
        if self._meta_store:
            self._meta_store.save_document(knowledge_doc)

        # Validate document state
        if document.extraction_status in (
            ExtractionStatus.FAILED,
            ExtractionStatus.UNSUPPORTED,
        ):
            return self._fail_document(
                doc_id, document, content_hash,
                "Document extraction failed or unsupported",
            )

        if not document.text.strip():
            return self._fail_document(
                doc_id, document, content_hash,
                "Document has no text content",
            )

        # --- Step 1: Chunk ---
        chunk_start = time.monotonic()
        try:
            chunks = self._chunker.chunk_document(document)
        except Exception as exc:
            logger.error("Chunking failed for %s: %s", doc_id, exc)
            return self._fail_document(
                doc_id, document, content_hash,
                f"Chunking failed: {exc}",
            )

        if not chunks:
            return self._fail_document(
                doc_id, document, content_hash,
                "No chunks produced",
            )

        # Set metadata and chunk hashes
        for chunk in chunks:
            chunk.metadata["filename"] = document.filename
            chunk.chunk_hash = _compute_chunk_hash(chunk.text)
            chunk.vector_id = chunk.chunk_id  # 1:1 mapping

        chunk_time = (time.monotonic() - chunk_start) * 1000

        # --- Step 2: Embed ---
        embed_start = time.monotonic()
        try:
            texts = [c.text for c in chunks]
            if hasattr(self._embedder, "partial_fit"):
                self._embedder.partial_fit(texts)  # type: ignore[attr-defined]
            elif hasattr(self._embedder, "fit"):
                existing_texts = [c.text for c in self._chunks.values()]
                self._embedder.fit(existing_texts + texts)  # type: ignore[attr-defined]

            embeddings = self._embedder.embed_batch(texts)
        except Exception as exc:
            logger.error("Embedding failed for %s: %s", doc_id, exc)
            return self._fail_document(
                doc_id, document, content_hash,
                f"Embedding failed: {exc}",
                chunk_count=len(chunks),
            )

        embed_time = (time.monotonic() - embed_start) * 1000

        # --- Step 3: Index vectors ---
        chunk_ids = [c.chunk_id for c in chunks]
        metadatas = [
            {
                "document_id": c.document_id,
                "filename": document.filename,
                "page_number": c.page_number,
                "section": c.section,
                "source": c.source,
                "chunk_index": c.chunk_index,
            }
            for c in chunks
        ]

        try:
            self._store.add_batch(chunk_ids, embeddings, metadatas)
        except Exception as exc:
            logger.error("Vector indexing failed for %s: %s", doc_id, exc)
            return self._fail_document(
                doc_id, document, content_hash,
                f"Vector indexing failed: {exc}",
                chunk_count=len(chunks),
            )

        # --- Step 4: Persist chunks ---
        for chunk in chunks:
            self._chunks[chunk.chunk_id] = chunk
        if self._meta_store:
            self._meta_store.save_chunks(chunks)

        total_time = (time.monotonic() - total_start) * 1000

        # --- Step 5: Record success ---
        knowledge_doc = KnowledgeDocument(
            document_id=doc_id,
            filename=document.filename,
            file_type=document.file_type.value,
            content_hash=content_hash,
            chunk_count=len(chunks),
            ingestion_status=IngestionStatus.INDEXED,
            embedding_provider=self._embedding_config.provider,
            embedding_version=self._embedding_config.version,
            ingested_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
            ingestion_time_ms=round(total_time, 2),
            embedding_time_ms=round(embed_time, 2),
            metadata={"chunk_time_ms": round(chunk_time, 2)},
        )
        self._documents[doc_id] = knowledge_doc
        if self._meta_store:
            self._meta_store.save_document(knowledge_doc)

        logger.info(
            "Ingested document %s (%s): %d chunks in %.1fms "
            "(chunk=%.1fms, embed=%.1fms)",
            doc_id, document.filename, len(chunks),
            total_time, chunk_time, embed_time,
        )

        return knowledge_doc

    def remove_document(self, document_id: str) -> bool:
        """Remove a document and all its chunks from the knowledge base."""
        if document_id not in self._documents:
            return False
        self._remove_document_chunks(document_id)
        del self._documents[document_id]
        if self._meta_store:
            self._meta_store.delete_document(document_id)
        return True

    def check_embedding_compatibility(self) -> bool:
        """Check if the current embedding config is compatible with the stored index."""
        if self._meta_store is None:
            return True
        return self._meta_store.is_embedding_compatible(self._embedding_config)

    def mark_all_stale(self) -> int:
        """Mark all indexed documents as stale (embedding config changed)."""
        count = 0
        for doc_id, doc in self._documents.items():
            if doc.ingestion_status == IngestionStatus.INDEXED:
                updated = doc.model_copy(
                    update={"ingestion_status": IngestionStatus.STALE}
                )
                self._documents[doc_id] = updated
                count += 1
        if self._meta_store:
            self._meta_store.mark_all_stale()
        return count

    def _remove_document_chunks(self, document_id: str) -> None:
        """Remove all chunks for a document from vector store and index."""
        self._store.delete_by_document(document_id)
        chunk_ids_to_remove = [
            cid
            for cid, chunk in self._chunks.items()
            if chunk.document_id == document_id
        ]
        for cid in chunk_ids_to_remove:
            del self._chunks[cid]
        if self._meta_store:
            self._meta_store.delete_chunks_by_document(document_id)

    def _fail_document(
        self,
        doc_id: str,
        document: Document,
        content_hash: str,
        error: str,
        *,
        chunk_count: int = 0,
    ) -> KnowledgeDocument:
        """Record a failed ingestion."""
        knowledge_doc = KnowledgeDocument(
            document_id=doc_id,
            filename=document.filename,
            file_type=document.file_type.value,
            content_hash=content_hash,
            chunk_count=chunk_count,
            ingestion_status=IngestionStatus.FAILED,
            error_info=error,
            updated_at=datetime.now(timezone.utc).isoformat(),
            metadata={"error": error},
        )
        self._documents[doc_id] = knowledge_doc
        if self._meta_store:
            self._meta_store.save_document(knowledge_doc)
        return knowledge_doc
