"""
Knowledge ingestion service.

Orchestrates the full ingestion pipeline:

    Document → Chunk → Embed → Vector Store

Reuses the existing Document Intelligence subsystem for document
retrieval. Does not reimplement PDF/DOCX/OCR processing.

Features:
- Ingests existing normalized documents from the document store.
- Prevents duplicate ingestion (idempotent chunk IDs).
- Supports re-indexing (deletes old chunks, re-indexes).
- Preserves document/chunk relationships.
- Records ingestion status and timing.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from app.documents.models import Document, ExtractionStatus
from app.knowledge.chunking import ChunkingService
from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.models import (
    IngestionStatus,
    KnowledgeChunk,
    KnowledgeDocument,
)
from app.knowledge.vector_store import VectorStore

logger = logging.getLogger(__name__)


class IngestionError(Exception):
    """Raised when document ingestion fails."""


class KnowledgeIngestionService:
    """Orchestrates document ingestion into the knowledge base.

    Args:
        chunking_service: Splits documents into chunks.
        embedding_provider: Produces embeddings for chunks.
        vector_store: Stores and indexes embeddings.
    """

    def __init__(
        self,
        chunking_service: ChunkingService,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore,
    ) -> None:
        self._chunker = chunking_service
        self._embedder = embedding_provider
        self._store = vector_store
        # Track ingested documents
        self._documents: dict[str, KnowledgeDocument] = {}
        self._chunks: dict[str, KnowledgeChunk] = {}  # chunk_id -> chunk

    @property
    def documents(self) -> dict[str, KnowledgeDocument]:
        return self._documents

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
        """Check if a document has already been ingested."""
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

        Raises:
            IngestionError: If the document cannot be ingested.
        """
        doc_id = document.document_id
        total_start = time.monotonic()

        # Check if already ingested
        if self.is_ingested(doc_id) and not force:
            logger.info("Document %s already ingested — skipping", doc_id)
            return self._documents[doc_id]

        # Clean up if re-indexing
        if doc_id in self._documents:
            self._remove_document_chunks(doc_id)

        # Validate document state
        if document.extraction_status in (
            ExtractionStatus.FAILED,
            ExtractionStatus.UNSUPPORTED,
        ):
            knowledge_doc = KnowledgeDocument(
                document_id=doc_id,
                filename=document.filename,
                file_type=document.file_type.value,
                ingestion_status=IngestionStatus.FAILED,
                metadata={"error": "Document extraction failed or unsupported"},
            )
            self._documents[doc_id] = knowledge_doc
            return knowledge_doc

        if not document.text.strip():
            knowledge_doc = KnowledgeDocument(
                document_id=doc_id,
                filename=document.filename,
                file_type=document.file_type.value,
                ingestion_status=IngestionStatus.FAILED,
                metadata={"error": "Document has no text content"},
            )
            self._documents[doc_id] = knowledge_doc
            return knowledge_doc

        # --- Step 1: Chunk ---
        chunk_start = time.monotonic()
        try:
            chunks = self._chunker.chunk_document(document)
        except Exception as exc:
            logger.error("Chunking failed for %s: %s", doc_id, exc)
            knowledge_doc = KnowledgeDocument(
                document_id=doc_id,
                filename=document.filename,
                file_type=document.file_type.value,
                ingestion_status=IngestionStatus.FAILED,
                metadata={"error": f"Chunking failed: {exc}"},
            )
            self._documents[doc_id] = knowledge_doc
            return knowledge_doc

        if not chunks:
            knowledge_doc = KnowledgeDocument(
                document_id=doc_id,
                filename=document.filename,
                file_type=document.file_type.value,
                ingestion_status=IngestionStatus.FAILED,
                metadata={"error": "No chunks produced"},
            )
            self._documents[doc_id] = knowledge_doc
            return knowledge_doc

        # Ensure filename metadata is set
        for chunk in chunks:
            chunk.metadata["filename"] = document.filename

        chunk_time = (time.monotonic() - chunk_start) * 1000

        # --- Step 2: Embed ---
        embed_start = time.monotonic()
        try:
            texts = [c.text for c in chunks]
            # Fit the embedder on the new texts
            if hasattr(self._embedder, "partial_fit"):
                self._embedder.partial_fit(texts)  # type: ignore[attr-defined]
            elif hasattr(self._embedder, "fit"):
                # Gather all existing chunk texts + new ones for fitting
                existing_texts = [c.text for c in self._chunks.values()]
                self._embedder.fit(existing_texts + texts)  # type: ignore[attr-defined]

            embeddings = self._embedder.embed_batch(texts)
        except Exception as exc:
            logger.error("Embedding failed for %s: %s", doc_id, exc)
            knowledge_doc = KnowledgeDocument(
                document_id=doc_id,
                filename=document.filename,
                file_type=document.file_type.value,
                chunk_count=len(chunks),
                ingestion_status=IngestionStatus.FAILED,
                metadata={"error": f"Embedding failed: {exc}"},
            )
            self._documents[doc_id] = knowledge_doc
            return knowledge_doc

        embed_time = (time.monotonic() - embed_start) * 1000

        # --- Step 3: Index ---
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

        self._store.add_batch(chunk_ids, embeddings, metadatas)

        # Store chunks in our index
        for chunk in chunks:
            self._chunks[chunk.chunk_id] = chunk

        total_time = (time.monotonic() - total_start) * 1000

        knowledge_doc = KnowledgeDocument(
            document_id=doc_id,
            filename=document.filename,
            file_type=document.file_type.value,
            chunk_count=len(chunks),
            ingestion_status=IngestionStatus.INDEXED,
            ingested_at=datetime.now(timezone.utc).isoformat(),
            ingestion_time_ms=round(total_time, 2),
            embedding_time_ms=round(embed_time, 2),
            metadata={
                "chunk_time_ms": round(chunk_time, 2),
            },
        )
        self._documents[doc_id] = knowledge_doc

        logger.info(
            "Ingested document %s (%s): %d chunks in %.1fms "
            "(chunk=%.1fms, embed=%.1fms)",
            doc_id,
            document.filename,
            len(chunks),
            total_time,
            chunk_time,
            embed_time,
        )

        return knowledge_doc

    def remove_document(self, document_id: str) -> bool:
        """Remove a document and all its chunks from the knowledge base."""
        if document_id not in self._documents:
            return False
        self._remove_document_chunks(document_id)
        del self._documents[document_id]
        return True

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
