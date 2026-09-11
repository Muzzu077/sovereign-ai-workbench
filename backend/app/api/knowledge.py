"""
Knowledge API routes.

Endpoints for knowledge base management and RAG queries:

    POST /knowledge/ingest/{document_id}   — Ingest a document
    POST /knowledge/search                 — Semantic search
    POST /knowledge/query                  — RAG query (search + LLM answer)
    GET  /knowledge/documents              — List ingested documents
    DELETE /knowledge/documents/{document_id} — Remove from knowledge base
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.knowledge.models import (
    Citation,
    IngestionStatus,
    KnowledgeDocument,
    RAGResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# --- Request / Response models ---


class IngestResponse(BaseModel):
    document_id: str
    filename: str
    file_type: str
    chunk_count: int
    ingestion_status: str
    ingestion_time_ms: float
    embedding_time_ms: float


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=50)


class SearchResult(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    text: str
    page_number: int | None = None
    section: str | None = None
    score: float


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    retrieval_time_ms: float


class QueryRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=50)


class QueryResponse(BaseModel):
    query: str
    answer: str
    citations: list[Citation]
    model_used: str
    retrieval_count: int
    retrieval_time_ms: float
    generation_time_ms: float
    total_time_ms: float
    evidence_sufficient: bool


class KnowledgeDocumentResponse(BaseModel):
    document_id: str
    filename: str
    file_type: str
    chunk_count: int
    ingestion_status: str
    ingested_at: str | None
    ingestion_time_ms: float
    embedding_time_ms: float


# --- Endpoints ---


@router.post("/ingest/{document_id}", response_model=IngestResponse)
def ingest_document(document_id: str, request: Request) -> IngestResponse:
    """Ingest a document into the knowledge base.

    The document must already exist in the document store
    (uploaded via POST /files/upload).
    """
    doc_store = getattr(request.app.state, "document_store", None)
    ingestion_svc = getattr(request.app.state, "knowledge_ingestion", None)
    audit = getattr(request.app.state, "audit_service", None)

    if ingestion_svc is None:
        raise HTTPException(
            status_code=503,
            detail="Knowledge ingestion service is not initialized.",
        )

    if doc_store is None:
        raise HTTPException(
            status_code=503,
            detail="Document store is not initialized.",
        )

    # Retrieve the source document
    document = doc_store.get_document(document_id)
    if document is None:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{document_id}' not found in document store.",
        )

    # Ingest
    try:
        knowledge_doc = ingestion_svc.ingest(document, force=False)
    except Exception as exc:
        logger.error("Ingestion failed for %s: %s", document_id, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Ingestion failed: {exc}",
        )

    # Audit
    if audit:
        audit.record(
            task="knowledge_ingest",
            selected_model="n/a",
            execution_status=(
                "success"
                if knowledge_doc.ingestion_status == IngestionStatus.INDEXED
                else "failed"
            ),
            metadata={
                "document_id": document_id,
                "filename": knowledge_doc.filename,
                "chunk_count": knowledge_doc.chunk_count,
                "ingestion_time_ms": knowledge_doc.ingestion_time_ms,
            },
        )

    return IngestResponse(
        document_id=knowledge_doc.document_id,
        filename=knowledge_doc.filename,
        file_type=knowledge_doc.file_type,
        chunk_count=knowledge_doc.chunk_count,
        ingestion_status=knowledge_doc.ingestion_status.value,
        ingestion_time_ms=knowledge_doc.ingestion_time_ms,
        embedding_time_ms=knowledge_doc.embedding_time_ms,
    )


@router.post("/search", response_model=SearchResponse)
def search_knowledge(body: SearchRequest, request: Request) -> SearchResponse:
    """Search the knowledge base for relevant chunks.

    Returns raw retrieval results without LLM generation.
    """
    retriever = getattr(request.app.state, "knowledge_retriever", None)
    if retriever is None:
        raise HTTPException(
            status_code=503,
            detail="Knowledge retriever is not initialized.",
        )

    if not body.query.strip():
        raise HTTPException(status_code=422, detail="Query must not be empty.")

    results, retrieval_time = retriever.retrieve(
        query=body.query, top_k=body.top_k
    )

    return SearchResponse(
        query=body.query,
        results=[
            SearchResult(
                chunk_id=r.chunk.chunk_id,
                document_id=r.document_id,
                filename=r.filename,
                text=r.chunk.text,
                page_number=r.page_number,
                section=r.section,
                score=round(r.score, 4),
            )
            for r in results
        ],
        retrieval_time_ms=round(retrieval_time, 2),
    )


@router.post("/query", response_model=QueryResponse)
def query_knowledge(body: QueryRequest, request: Request) -> QueryResponse:
    """Query the knowledge base with RAG.

    Retrieves relevant chunks, builds context, generates an answer
    via the local LLM, and returns the answer with citations.
    """
    rag_service = getattr(request.app.state, "rag_service", None)
    audit = getattr(request.app.state, "audit_service", None)

    if rag_service is None:
        raise HTTPException(
            status_code=503,
            detail="RAG service is not initialized.",
        )

    if not body.query.strip():
        raise HTTPException(status_code=422, detail="Query must not be empty.")

    try:
        rag_response = rag_service.query(query=body.query, top_k=body.top_k)
    except Exception as exc:
        logger.error("RAG query failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"RAG query failed: {exc}",
        )

    # Audit (metadata only)
    if audit:
        audit.record(
            task="knowledge_query",
            selected_model=rag_response.model_used,
            execution_status="success",
            metadata={
                "query_length": len(body.query),
                "retrieval_count": rag_response.retrieval_count,
                "evidence_sufficient": rag_response.evidence_sufficient,
                "retrieval_time_ms": rag_response.retrieval_time_ms,
                "generation_time_ms": rag_response.generation_time_ms,
                "total_time_ms": rag_response.total_time_ms,
                "local_inference": True,
            },
        )

    return QueryResponse(
        query=rag_response.query,
        answer=rag_response.answer,
        citations=rag_response.citations,
        model_used=rag_response.model_used,
        retrieval_count=rag_response.retrieval_count,
        retrieval_time_ms=rag_response.retrieval_time_ms,
        generation_time_ms=rag_response.generation_time_ms,
        total_time_ms=rag_response.total_time_ms,
        evidence_sufficient=rag_response.evidence_sufficient,
    )


@router.get("/documents", response_model=list[KnowledgeDocumentResponse])
def list_knowledge_documents(
    request: Request,
) -> list[KnowledgeDocumentResponse]:
    """List all documents in the knowledge base."""
    ingestion_svc = getattr(request.app.state, "knowledge_ingestion", None)
    if ingestion_svc is None:
        raise HTTPException(
            status_code=503,
            detail="Knowledge ingestion service is not initialized.",
        )

    docs = ingestion_svc.list_documents()
    return [
        KnowledgeDocumentResponse(
            document_id=d.document_id,
            filename=d.filename,
            file_type=d.file_type,
            chunk_count=d.chunk_count,
            ingestion_status=d.ingestion_status.value,
            ingested_at=d.ingested_at,
            ingestion_time_ms=d.ingestion_time_ms,
            embedding_time_ms=d.embedding_time_ms,
        )
        for d in docs
    ]


@router.delete("/documents/{document_id}")
def delete_knowledge_document(
    document_id: str, request: Request
) -> dict[str, str]:
    """Remove a document and all its chunks from the knowledge base."""
    ingestion_svc = getattr(request.app.state, "knowledge_ingestion", None)
    audit = getattr(request.app.state, "audit_service", None)

    if ingestion_svc is None:
        raise HTTPException(
            status_code=503,
            detail="Knowledge ingestion service is not initialized.",
        )

    removed = ingestion_svc.remove_document(document_id)
    if not removed:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{document_id}' not found in knowledge base.",
        )

    if audit:
        audit.record(
            task="knowledge_delete",
            selected_model="n/a",
            execution_status="success",
            metadata={"document_id": document_id},
        )

    return {"status": "deleted", "document_id": document_id}
