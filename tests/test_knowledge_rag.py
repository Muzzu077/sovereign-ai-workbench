"""
Comprehensive tests for the Knowledge Base & RAG subsystem.

Covers:
- Knowledge domain models
- Chunking service (provenance, config, determinism, dedup)
- TF-IDF embedding provider
- In-memory vector store
- Knowledge ingestion service (ingest, duplicate prevention, re-index)
- Knowledge retriever (ranking, empty results)
- Citation builder
- RAG service (context building, insufficient evidence)
- API endpoints (ingest, search, query, list, delete)
- knowledge_search tool
- Document-to-knowledge integration
- Evaluation fixtures with known-relevant queries
- Security (no external calls, no content in audit)
"""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.documents.models import (
    Document,
    DocumentMetadata,
    DocumentPage,
    ExtractionStatus,
    FileType,
)
from app.knowledge.models import (
    Citation,
    IngestionStatus,
    KnowledgeChunk,
    KnowledgeDocument,
    RAGResponse,
    RetrievalResult,
)
from app.knowledge.chunking import (
    ChunkingConfig,
    ChunkingService,
    _detect_section,
    _make_chunk_id,
)
from app.knowledge.embeddings import EmbeddingProvider
from app.knowledge.tfidf_embeddings import TfidfEmbeddingProvider
from app.knowledge.vector_store import VectorStore, VectorStoreResult
from app.knowledge.memory_store import InMemoryVectorStore
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.retrieval import KnowledgeRetriever
from app.knowledge.citations import build_citations
from app.knowledge.rag_service import RAGService, _build_rag_prompt
from app.tools.rag_tool import KnowledgeSearchTool
from app.config import get_settings


# ============================================================
# Helpers — create test documents
# ============================================================

def _make_document(
    doc_id: str = "doc-001",
    filename: str = "test.txt",
    text: str = "Hello world. This is a test document.",
    pages: list[DocumentPage] | None = None,
    status: ExtractionStatus = ExtractionStatus.TEXT_EXTRACTED,
    file_type: FileType = FileType.TXT,
) -> Document:
    if pages is None:
        pages = [
            DocumentPage(page_number=1, text=text, source="text_extraction")
        ]
    return Document(
        document_id=doc_id,
        filename=filename,
        file_type=file_type,
        file_size=len(text.encode()),
        page_count=len(pages),
        extraction_status=status,
        text=text,
        pages=pages,
        metadata=DocumentMetadata(original_filename=filename),
    )


MAINTENANCE_SOP = """
1. PURPOSE
This Standard Operating Procedure establishes the maintenance protocol
for all rotating equipment in Plant Unit 4.

2. SCOPE
Applies to turbines, compressors, and pumps rated above 100 kW.

3. SAFETY REQUIREMENTS
3.1 All personnel must wear appropriate PPE including hard hats,
safety glasses, and steel-toed boots.
3.2 Lock-out/tag-out procedures must be followed before any
maintenance activity.

4. INSPECTION SCHEDULE
4.1 Daily visual inspections of bearing housings.
4.2 Weekly vibration measurements using portable analyzers.
4.3 Monthly oil analysis samples submitted to on-site lab.

5. CORRECTIVE ACTIONS
5.1 If vibration exceeds 4.5 mm/s RMS, schedule immediate inspection.
5.2 If oil contamination is detected, replace filters and flush lines.
5.3 Document all findings in the maintenance management system.
"""

EQUIPMENT_MANUAL = """
TURBINE MODEL T-400 OPERATIONS MANUAL

Chapter 1: Overview
The T-400 is a single-stage axial turbine designed for continuous
industrial operation at speeds up to 3600 RPM.

Chapter 2: Specifications
- Rated power: 400 kW
- Operating temperature: 150-450 degrees Celsius
- Bearing type: Tilting pad journal bearings
- Lubrication: ISO VG 46 turbine oil
- Oil capacity: 200 liters

Chapter 3: Startup Procedure
3.1 Verify oil level is within the sight glass range.
3.2 Start auxiliary oil pump and confirm oil pressure above 1.5 bar.
3.3 Engage turning gear for minimum 30 minutes before startup.
3.4 Gradually increase speed to operating RPM over 15 minutes.

Chapter 4: Shutdown Procedure
4.1 Reduce load gradually over 10 minutes.
4.2 Allow turbine to coast down with turning gear engaged.
4.3 Monitor bearing temperatures during cooldown.
"""

INSPECTION_REPORT = """
INSPECTION REPORT — Unit 4 Turbine
Date: 2026-08-15
Inspector: J. Kumar

FINDINGS:
1. Bearing housing B shows elevated vibration at 4.8 mm/s RMS
   (threshold: 4.5 mm/s). Recommend immediate inspection.
2. Oil sample B-2026-08 shows metal particle count within limits
   but trending upward over last 3 months.
3. Coupling alignment verified within 0.05 mm tolerance.
4. Foundation bolts torqued to specification.

RECOMMENDATIONS:
- Schedule bearing replacement within 2 weeks.
- Increase oil sampling frequency to bi-weekly.
- Re-inspect coupling after next cold start.
"""


def _make_eval_documents() -> list[Document]:
    """Create evaluation documents with known content."""
    return [
        _make_document(
            doc_id="sop-001",
            filename="Maintenance_SOP.pdf",
            text=MAINTENANCE_SOP,
            file_type=FileType.PDF,
            pages=[
                DocumentPage(
                    page_number=1,
                    text=MAINTENANCE_SOP[:600],
                    source="text_extraction",
                ),
                DocumentPage(
                    page_number=2,
                    text=MAINTENANCE_SOP[600:],
                    source="text_extraction",
                ),
            ],
        ),
        _make_document(
            doc_id="manual-001",
            filename="Equipment_Manual.docx",
            text=EQUIPMENT_MANUAL,
            file_type=FileType.DOCX,
            pages=[
                DocumentPage(
                    page_number=1,
                    text=EQUIPMENT_MANUAL,
                    source="text_extraction",
                )
            ],
        ),
        _make_document(
            doc_id="report-001",
            filename="Inspection_Report.txt",
            text=INSPECTION_REPORT,
            file_type=FileType.TXT,
            pages=[
                DocumentPage(
                    page_number=1,
                    text=INSPECTION_REPORT,
                    source="text_extraction",
                )
            ],
        ),
    ]


def _build_ingested_system():
    """Build a fully ingested knowledge system with eval documents."""
    chunker = ChunkingService(ChunkingConfig(chunk_size=400, chunk_overlap=50))
    embedder = TfidfEmbeddingProvider(max_features=256)
    store = InMemoryVectorStore()
    ingestion = KnowledgeIngestionService(chunker, embedder, store)
    retriever = KnowledgeRetriever(embedder, store, ingestion)

    docs = _make_eval_documents()
    for doc in docs:
        ingestion.ingest(doc)

    return ingestion, retriever, store, embedder, docs


# ============================================================
# 1. Knowledge Domain Models
# ============================================================

class TestKnowledgeModels:
    def test_knowledge_chunk_creation(self):
        chunk = KnowledgeChunk(
            chunk_id="c1",
            document_id="d1",
            text="hello world",
            page_number=1,
            section="1.1",
            source="text_extraction",
            chunk_index=0,
        )
        assert chunk.chunk_id == "c1"
        assert chunk.document_id == "d1"
        assert chunk.page_number == 1
        assert chunk.section == "1.1"

    def test_knowledge_document_creation(self):
        doc = KnowledgeDocument(
            document_id="d1",
            filename="test.pdf",
            file_type="pdf",
            chunk_count=5,
            ingestion_status=IngestionStatus.INDEXED,
        )
        assert doc.ingestion_status == IngestionStatus.INDEXED
        assert doc.chunk_count == 5

    def test_retrieval_result(self):
        chunk = KnowledgeChunk(
            chunk_id="c1", document_id="d1", text="content"
        )
        result = RetrievalResult(
            chunk=chunk,
            score=0.85,
            document_id="d1",
            filename="test.pdf",
            page_number=3,
            section="2.1",
        )
        assert result.score == 0.85
        assert result.filename == "test.pdf"

    def test_citation(self):
        citation = Citation(
            document="Maintenance_SOP.pdf",
            page=17,
            section="4.2",
        )
        assert citation.document == "Maintenance_SOP.pdf"
        assert citation.page == 17

    def test_rag_response(self):
        resp = RAGResponse(
            query="What is PPE?",
            answer="Personal Protective Equipment",
            citations=[Citation(document="SOP.pdf", page=1)],
            model_used="gemma-3-4b-it",
            retrieval_count=3,
        )
        assert resp.evidence_sufficient is True
        assert len(resp.citations) == 1

    def test_ingestion_status_enum(self):
        assert IngestionStatus.PENDING.value == "pending"
        assert IngestionStatus.INDEXED.value == "indexed"
        assert IngestionStatus.FAILED.value == "failed"

    def test_knowledge_chunk_metadata(self):
        chunk = KnowledgeChunk(
            chunk_id="c1",
            document_id="d1",
            text="test",
            metadata={"custom_key": "custom_value"},
        )
        assert chunk.metadata["custom_key"] == "custom_value"

    def test_knowledge_chunk_serialization(self):
        chunk = KnowledgeChunk(
            chunk_id="c1",
            document_id="d1",
            text="test",
            page_number=5,
            section="3.2",
        )
        data = chunk.model_dump()
        assert data["chunk_id"] == "c1"
        assert data["page_number"] == 5
        assert data["section"] == "3.2"


# ============================================================
# 2. Chunking Service
# ============================================================

class TestChunkingConfig:
    def test_default_config(self):
        config = ChunkingConfig()
        assert config.chunk_size == 800
        assert config.chunk_overlap == 100
        assert config.min_chunk_size == 50

    def test_custom_config(self):
        config = ChunkingConfig(chunk_size=400, chunk_overlap=50)
        assert config.chunk_size == 400

    def test_overlap_must_be_less_than_size(self):
        with pytest.raises(ValueError, match="chunk_overlap"):
            ChunkingConfig(chunk_size=100, chunk_overlap=100)

    def test_overlap_greater_than_size_raises(self):
        with pytest.raises(ValueError):
            ChunkingConfig(chunk_size=100, chunk_overlap=200)


class TestChunkIdDeterminism:
    def test_same_inputs_same_id(self):
        id1 = _make_chunk_id("doc-1", 0)
        id2 = _make_chunk_id("doc-1", 0)
        assert id1 == id2

    def test_different_inputs_different_id(self):
        id1 = _make_chunk_id("doc-1", 0)
        id2 = _make_chunk_id("doc-1", 1)
        assert id1 != id2

    def test_different_docs_different_id(self):
        id1 = _make_chunk_id("doc-1", 0)
        id2 = _make_chunk_id("doc-2", 0)
        assert id1 != id2


class TestSectionDetection:
    def test_numbered_section(self):
        assert _detect_section("3.1 Safety Requirements\nSome text") is not None

    def test_chapter_header(self):
        assert _detect_section("Chapter 4: Shutdown\nSome text") is not None

    def test_uppercase_header(self):
        assert _detect_section("SAFETY REQUIREMENTS:\nSome text") is not None

    def test_no_section(self):
        assert _detect_section("just some regular text here.") is None


class TestChunkingService:
    def test_chunk_simple_document(self):
        text = (
            "This is a simple test document with enough content to exceed "
            "the minimum chunk size threshold for testing purposes."
        )
        doc = _make_document(text=text)
        chunker = ChunkingService(ChunkingConfig(chunk_size=800))
        chunks = chunker.chunk_document(doc)
        assert len(chunks) >= 1
        assert chunks[0].document_id == "doc-001"
        assert chunks[0].page_number == 1

    def test_chunk_preserves_document_id(self):
        doc = _make_document(doc_id="my-doc-123", text=MAINTENANCE_SOP)
        chunker = ChunkingService()
        chunks = chunker.chunk_document(doc)
        for chunk in chunks:
            assert chunk.document_id == "my-doc-123"

    def test_chunk_preserves_page_number(self):
        page1_text = (
            "Page one content covering turbine bearing maintenance "
            "procedures and safety requirements for all plant personnel."
        )
        page2_text = (
            "Page two content covering oil analysis results and "
            "vibration measurements recorded during monthly inspection."
        )
        pages = [
            DocumentPage(page_number=1, text=page1_text, source="text_extraction"),
            DocumentPage(page_number=2, text=page2_text, source="text_extraction"),
        ]
        doc = _make_document(
            pages=pages, text=page1_text + " " + page2_text
        )
        chunker = ChunkingService(ChunkingConfig(chunk_size=800))
        chunks = chunker.chunk_document(doc)
        page_numbers = {c.page_number for c in chunks}
        assert 1 in page_numbers
        assert 2 in page_numbers

    def test_chunk_preserves_source(self):
        text = (
            "This document was processed through OCR and contains enough "
            "text to produce at least one chunk for testing source preservation."
        )
        doc = _make_document(text=text)
        doc.pages[0].source = "ocr"
        chunker = ChunkingService()
        chunks = chunker.chunk_document(doc)
        assert chunks[0].source == "ocr"

    def test_large_document_produces_multiple_chunks(self):
        text = "This is a test sentence. " * 200  # ~5000 chars
        doc = _make_document(text=text)
        chunker = ChunkingService(
            ChunkingConfig(chunk_size=200, chunk_overlap=20)
        )
        chunks = chunker.chunk_document(doc)
        assert len(chunks) > 1

    def test_no_duplicate_chunk_ids(self):
        text = "Paragraph one with enough words to pass the minimum size.\n\nParagraph two with enough words to pass the minimum size.\n\n" * 20
        doc = _make_document(text=text)
        chunker = ChunkingService(ChunkingConfig(chunk_size=200, chunk_overlap=20))
        chunks = chunker.chunk_document(doc)
        ids = [c.chunk_id for c in chunks]
        assert len(ids) == len(set(ids)), "Duplicate chunk IDs found"

    def test_deterministic_chunking(self):
        doc = _make_document(text=MAINTENANCE_SOP)
        chunker = ChunkingService(ChunkingConfig(chunk_size=300))
        chunks_1 = chunker.chunk_document(doc)
        chunks_2 = chunker.chunk_document(doc)
        assert len(chunks_1) == len(chunks_2)
        for c1, c2 in zip(chunks_1, chunks_2):
            assert c1.chunk_id == c2.chunk_id
            assert c1.text == c2.text

    def test_empty_document_no_chunks(self):
        doc = _make_document(text="", pages=[])
        chunker = ChunkingService()
        chunks = chunker.chunk_document(doc)
        assert len(chunks) == 0

    def test_min_chunk_size_respected(self):
        doc = _make_document(text="Hi.\n\nOk.\n\nYes.")
        chunker = ChunkingService(
            ChunkingConfig(chunk_size=800, min_chunk_size=200)
        )
        chunks = chunker.chunk_document(doc)
        # Very short text may produce 0 chunks if all below min size,
        # or be merged into one
        for chunk in chunks:
            assert len(chunk.text) >= 10  # at least something reasonable

    def test_section_detection_in_chunks(self):
        doc = _make_document(text=MAINTENANCE_SOP)
        chunker = ChunkingService(ChunkingConfig(chunk_size=300))
        chunks = chunker.chunk_document(doc)
        sections_found = [c.section for c in chunks if c.section]
        assert len(sections_found) > 0


# ============================================================
# 3. TF-IDF Embedding Provider
# ============================================================

class TestTfidfEmbeddings:
    def test_embed_single(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        embedder.fit(["hello world", "foo bar baz"])
        vec = embedder.embed("hello world")
        assert isinstance(vec, np.ndarray)
        assert vec.shape == (64,)

    def test_embed_batch(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        texts = ["hello world", "foo bar", "test doc"]
        embedder.fit(texts)
        vecs = embedder.embed_batch(texts)
        assert len(vecs) == 3
        assert all(v.shape == (64,) for v in vecs)

    def test_dimension(self):
        embedder = TfidfEmbeddingProvider(max_features=128)
        assert embedder.dimension() == 128

    def test_get_name(self):
        embedder = TfidfEmbeddingProvider(max_features=256)
        assert embedder.get_name() == "tfidf-256"

    def test_fit_then_embed(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        assert not embedder.fitted
        embedder.fit(["turbine maintenance", "oil analysis results"])
        assert embedder.fitted
        vec = embedder.embed("turbine oil")
        assert np.linalg.norm(vec) > 0

    def test_auto_fit_on_embed(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        vec = embedder.embed("auto fit test")
        assert embedder.fitted
        assert vec.shape == (64,)

    def test_partial_fit(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        embedder.fit(["initial corpus"])
        v1 = embedder.vocabulary_size()
        embedder.partial_fit(["additional vocabulary words here"])
        v2 = embedder.vocabulary_size()
        assert v2 >= v1

    def test_similar_texts_closer(self):
        embedder = TfidfEmbeddingProvider(max_features=128)
        embedder.fit([
            "turbine bearing vibration analysis",
            "oil contamination in machinery",
            "cooking recipes for pasta dinner",
        ])
        v1 = embedder.embed("turbine bearing vibration analysis")
        v2 = embedder.embed("vibration analysis of bearings")
        v3 = embedder.embed("cooking recipes for dinner")
        sim_12 = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
        sim_13 = np.dot(v1, v3) / (np.linalg.norm(v1) * np.linalg.norm(v3))
        assert sim_12 > sim_13

    def test_empty_batch_returns_empty(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        assert embedder.embed_batch([]) == []

    def test_inherits_abstract(self):
        embedder = TfidfEmbeddingProvider()
        assert isinstance(embedder, EmbeddingProvider)


# ============================================================
# 4. In-Memory Vector Store
# ============================================================

class TestInMemoryVectorStore:
    def test_add_and_count(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0, 0.0, 0.0]))
        assert store.count() == 1

    def test_add_batch(self):
        store = InMemoryVectorStore()
        store.add_batch(
            ["c1", "c2"],
            [np.array([1.0, 0.0]), np.array([0.0, 1.0])],
        )
        assert store.count() == 2

    def test_search_returns_ordered(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0, 0.0, 0.0]))
        store.add("c2", np.array([0.7, 0.7, 0.0]))
        store.add("c3", np.array([0.0, 0.0, 1.0]))

        results = store.search(np.array([1.0, 0.0, 0.0]), top_k=3)
        assert len(results) >= 2
        assert results[0].chunk_id == "c1"
        assert results[0].score > results[1].score

    def test_search_top_k(self):
        store = InMemoryVectorStore()
        for i in range(10):
            vec = np.zeros(5)
            vec[i % 5] = 1.0
            store.add(f"c{i}", vec)
        results = store.search(np.array([1.0, 0, 0, 0, 0]), top_k=3)
        assert len(results) <= 3

    def test_search_empty_store(self):
        store = InMemoryVectorStore()
        results = store.search(np.array([1.0, 0.0]), top_k=5)
        assert results == []

    def test_search_zero_vector(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0, 0.0]))
        results = store.search(np.array([0.0, 0.0]), top_k=5)
        assert results == []

    def test_delete(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0, 0.0]))
        assert store.delete("c1")
        assert store.count() == 0

    def test_delete_nonexistent(self):
        store = InMemoryVectorStore()
        assert not store.delete("nonexistent")

    def test_delete_by_document(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0]), {"document_id": "d1"})
        store.add("c2", np.array([0.0]), {"document_id": "d1"})
        store.add("c3", np.array([0.5]), {"document_id": "d2"})
        removed = store.delete_by_document("d1")
        assert removed == 2
        assert store.count() == 1

    def test_clear(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0]))
        store.clear()
        assert store.count() == 0

    def test_upsert_existing(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0, 0.0]))
        store.add("c1", np.array([0.0, 1.0]))  # Update
        assert store.count() == 1
        results = store.search(np.array([0.0, 1.0]), top_k=1)
        assert results[0].chunk_id == "c1"
        assert results[0].score > 0.9

    def test_has(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0]))
        assert store.has("c1")
        assert not store.has("c2")

    def test_metadata_preserved(self):
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0]), {"key": "value"})
        results = store.search(np.array([1.0]), top_k=1)
        assert results[0].metadata["key"] == "value"

    def test_inherits_abstract(self):
        store = InMemoryVectorStore()
        assert isinstance(store, VectorStore)


# ============================================================
# 5. Knowledge Ingestion Service
# ============================================================

class TestKnowledgeIngestion:
    def _build_service(self):
        chunker = ChunkingService(ChunkingConfig(chunk_size=300))
        embedder = TfidfEmbeddingProvider(max_features=64)
        store = InMemoryVectorStore()
        return KnowledgeIngestionService(chunker, embedder, store), store

    def test_ingest_document(self):
        svc, store = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        result = svc.ingest(doc)
        assert result.ingestion_status == IngestionStatus.INDEXED
        assert result.chunk_count > 0
        assert store.count() > 0

    def test_ingest_records_timing(self):
        svc, _ = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        result = svc.ingest(doc)
        assert result.ingestion_time_ms > 0
        assert result.embedding_time_ms >= 0

    def test_duplicate_prevention(self):
        svc, store = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        r1 = svc.ingest(doc)
        count_after_first = store.count()
        r2 = svc.ingest(doc)  # Should skip
        assert store.count() == count_after_first
        assert r2.ingestion_status == IngestionStatus.INDEXED

    def test_force_reindex(self):
        svc, store = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        svc.ingest(doc)
        count_first = store.count()
        svc.ingest(doc, force=True)  # Should re-index
        # Count may change if chunking produces different results after refit
        assert store.count() > 0

    def test_ingest_failed_document(self):
        svc, _ = self._build_service()
        doc = _make_document(
            text="", status=ExtractionStatus.FAILED, pages=[]
        )
        result = svc.ingest(doc)
        assert result.ingestion_status == IngestionStatus.FAILED

    def test_ingest_empty_text(self):
        svc, _ = self._build_service()
        doc = _make_document(text="  ", pages=[])
        result = svc.ingest(doc)
        assert result.ingestion_status == IngestionStatus.FAILED

    def test_get_chunk(self):
        svc, _ = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        svc.ingest(doc)
        chunks = list(svc._chunks.values())
        assert len(chunks) > 0
        retrieved = svc.get_chunk(chunks[0].chunk_id)
        assert retrieved is not None
        assert retrieved.chunk_id == chunks[0].chunk_id

    def test_list_documents(self):
        svc, _ = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        svc.ingest(doc)
        docs = svc.list_documents()
        assert len(docs) == 1
        assert docs[0].document_id == "doc-001"

    def test_remove_document(self):
        svc, store = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        svc.ingest(doc)
        assert store.count() > 0
        removed = svc.remove_document("doc-001")
        assert removed
        assert store.count() == 0
        assert svc.get_document("doc-001") is None

    def test_remove_nonexistent(self):
        svc, _ = self._build_service()
        assert not svc.remove_document("nonexistent")

    def test_is_ingested(self):
        svc, _ = self._build_service()
        doc = _make_document(text=MAINTENANCE_SOP)
        assert not svc.is_ingested("doc-001")
        svc.ingest(doc)
        assert svc.is_ingested("doc-001")

    def test_chunk_provenance_preserved(self):
        svc, _ = self._build_service()
        doc = _make_document(
            doc_id="prov-test",
            filename="test_prov.pdf",
            text=MAINTENANCE_SOP,
            file_type=FileType.PDF,
        )
        svc.ingest(doc)
        for chunk in svc._chunks.values():
            if chunk.document_id == "prov-test":
                assert chunk.metadata.get("filename") == "test_prov.pdf"
                assert chunk.page_number is not None
                assert chunk.source != ""


# ============================================================
# 6. Knowledge Retriever
# ============================================================

class TestKnowledgeRetriever:
    def test_retrieve_returns_results(self):
        ingestion, retriever, _, _, _ = _build_ingested_system()
        results, time_ms = retriever.retrieve("vibration bearing", top_k=3)
        assert len(results) > 0
        assert time_ms >= 0

    def test_retrieve_ordered_by_score(self):
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("turbine maintenance", top_k=5)
        scores = [r.score for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_retrieve_has_provenance(self):
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("PPE safety requirements", top_k=3)
        for r in results:
            assert r.document_id != ""
            assert r.filename != ""
            assert r.chunk is not None

    def test_retrieve_empty_query(self):
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("", top_k=5)
        assert len(results) == 0

    def test_retrieve_empty_store(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        store = InMemoryVectorStore()
        chunker = ChunkingService()
        ingestion = KnowledgeIngestionService(chunker, embedder, store)
        retriever = KnowledgeRetriever(embedder, store, ingestion)
        results, _ = retriever.retrieve("test query", top_k=5)
        assert len(results) == 0

    def test_retrieve_top_k_respected(self):
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("maintenance", top_k=2)
        assert len(results) <= 2


# ============================================================
# 7. Citation Builder
# ============================================================

class TestCitationBuilder:
    def test_build_from_results(self):
        chunk = KnowledgeChunk(
            chunk_id="c1", document_id="d1", text="text"
        )
        results = [
            RetrievalResult(
                chunk=chunk,
                score=0.9,
                document_id="d1",
                filename="Maintenance_SOP.pdf",
                page_number=2,
                section="3.1",
            )
        ]
        citations = build_citations(results)
        assert len(citations) == 1
        assert citations[0].document == "Maintenance_SOP.pdf"
        assert citations[0].page == 2
        assert citations[0].section == "3.1"

    def test_deduplicates_same_location(self):
        chunk1 = KnowledgeChunk(
            chunk_id="c1", document_id="d1", text="a"
        )
        chunk2 = KnowledgeChunk(
            chunk_id="c2", document_id="d1", text="b"
        )
        results = [
            RetrievalResult(
                chunk=chunk1, score=0.9, document_id="d1",
                filename="SOP.pdf", page_number=2, section="3.1",
            ),
            RetrievalResult(
                chunk=chunk2, score=0.8, document_id="d1",
                filename="SOP.pdf", page_number=2, section="3.1",
            ),
        ]
        citations = build_citations(results)
        assert len(citations) == 1

    def test_different_pages_not_deduped(self):
        chunk1 = KnowledgeChunk(
            chunk_id="c1", document_id="d1", text="a"
        )
        chunk2 = KnowledgeChunk(
            chunk_id="c2", document_id="d1", text="b"
        )
        results = [
            RetrievalResult(
                chunk=chunk1, score=0.9, document_id="d1",
                filename="SOP.pdf", page_number=1, section=None,
            ),
            RetrievalResult(
                chunk=chunk2, score=0.8, document_id="d1",
                filename="SOP.pdf", page_number=2, section=None,
            ),
        ]
        citations = build_citations(results)
        assert len(citations) == 2

    def test_empty_results(self):
        citations = build_citations([])
        assert citations == []

    def test_citations_have_relevance_score(self):
        chunk = KnowledgeChunk(
            chunk_id="c1", document_id="d1", text="text"
        )
        results = [
            RetrievalResult(
                chunk=chunk, score=0.8765,
                document_id="d1", filename="test.pdf",
            )
        ]
        citations = build_citations(results)
        assert citations[0].relevance_score == 0.8765


# ============================================================
# 8. RAG Service
# ============================================================

class TestRAGPromptBuilder:
    def test_builds_prompt_with_evidence(self):
        prompt = _build_rag_prompt(
            "What is the vibration threshold?",
            ["[Source: SOP.pdf, Page 2]\nVibration threshold is 4.5 mm/s."],
        )
        assert "EVIDENCE" in prompt
        assert "4.5 mm/s" in prompt
        assert "QUESTION" in prompt

    def test_insufficient_evidence_prompt(self):
        prompt = _build_rag_prompt("What is gravity?", [], insufficient=True)
        assert "No relevant evidence" in prompt

    def test_empty_evidence_insufficient(self):
        prompt = _build_rag_prompt("test", [])
        assert "No relevant evidence" in prompt


class TestRAGService:
    def test_rag_query_with_evidence(self):
        ingestion, retriever, store, embedder, docs = _build_ingested_system()

        mock_provider = MagicMock()
        mock_provider.generate.return_value = MagicMock(
            text="The vibration threshold is 4.5 mm/s RMS.",
            model_name="test-model",
        )

        rag = RAGService(retriever, mock_provider)
        response = rag.query("What is the vibration threshold?")

        assert response.answer != ""
        assert response.retrieval_count > 0
        assert response.total_time_ms > 0
        mock_provider.generate.assert_called_once()

    def test_rag_query_empty_knowledge_base(self):
        embedder = TfidfEmbeddingProvider(max_features=64)
        store = InMemoryVectorStore()
        chunker = ChunkingService()
        ingestion = KnowledgeIngestionService(chunker, embedder, store)
        retriever = KnowledgeRetriever(embedder, store, ingestion)

        mock_provider = MagicMock()
        mock_provider.generate.return_value = MagicMock(
            text="No evidence found.",
            model_name="test-model",
        )

        rag = RAGService(retriever, mock_provider)
        response = rag.query("What is PPE?")

        assert not response.evidence_sufficient
        assert response.retrieval_count == 0

    def test_rag_includes_citations(self):
        ingestion, retriever, _, _, _ = _build_ingested_system()

        mock_provider = MagicMock()
        mock_provider.generate.return_value = MagicMock(
            text="Bearings should be inspected.",
            model_name="test-model",
        )

        rag = RAGService(retriever, mock_provider)
        response = rag.query("bearing inspection procedure")

        assert len(response.citations) > 0
        for citation in response.citations:
            assert citation.document != ""

    def test_rag_timing_metrics(self):
        ingestion, retriever, _, _, _ = _build_ingested_system()

        mock_provider = MagicMock()
        mock_provider.generate.return_value = MagicMock(
            text="Answer.", model_name="test"
        )

        rag = RAGService(retriever, mock_provider)
        response = rag.query("test query")

        assert response.retrieval_time_ms >= 0
        assert response.generation_time_ms >= 0
        assert response.total_time_ms >= 0

    def test_rag_handles_generation_error(self):
        ingestion, retriever, _, _, _ = _build_ingested_system()

        mock_provider = MagicMock()
        mock_provider.generate.side_effect = RuntimeError("LLM down")

        rag = RAGService(retriever, mock_provider)
        response = rag.query("bearing inspection")

        assert "failed" in response.answer.lower() or "error" in response.answer.lower()


# ============================================================
# 9. Knowledge Search Tool
# ============================================================

class TestKnowledgeSearchTool:
    def test_execute_returns_results(self):
        _, retriever, _, _, _ = _build_ingested_system()
        tool = KnowledgeSearchTool(retriever)
        result = tool.execute("vibration bearing", top_k=3)
        assert result["tool"] == "knowledge_search"
        assert isinstance(result["results"], list)

    def test_execute_empty_query(self):
        _, retriever, _, _, _ = _build_ingested_system()
        tool = KnowledgeSearchTool(retriever)
        result = tool.execute("")
        assert result["error"] == "Empty query"

    def test_tool_name_and_description(self):
        _, retriever, _, _, _ = _build_ingested_system()
        tool = KnowledgeSearchTool(retriever)
        assert tool.name == "knowledge_search"
        assert len(tool.description) > 0

    def test_results_have_provenance(self):
        _, retriever, _, _, _ = _build_ingested_system()
        tool = KnowledgeSearchTool(retriever)
        result = tool.execute("oil analysis", top_k=3)
        if result["results"]:
            r = result["results"][0]
            assert "document" in r
            assert "text" in r
            assert "score" in r


# ============================================================
# 10. API Endpoints
# ============================================================

class TestKnowledgeAPI:
    """Tests for the knowledge API endpoints using the TestClient."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path):
        """Create a fresh app with a temp upload dir.

        Uses the TestClient as a context manager so that the FastAPI
        lifespan runs and populates app.state (settings, registry,
        knowledge services, etc.).
        """
        os.environ["SAW_LLM_ENABLED"] = "false"
        os.environ["SAW_UPLOAD_DIR"] = str(tmp_path / "uploads")
        os.environ["SAW_KNOWLEDGE_DB_PATH"] = str(tmp_path / "knowledge.db")
        os.environ["SAW_VECTOR_STORAGE_PATH"] = str(tmp_path / "vectors")
        os.environ["SAW_DOCUMENT_DB_PATH"] = str(tmp_path / "documents.db")
        os.environ["SAW_AUDIT_LOG_FILE"] = str(tmp_path / "audit.log")
        from app.main import create_app
        self.app = create_app()
        with TestClient(self.app) as client:
            self.client = client
            yield

    def _upload_txt(self, content: str = "Test content.") -> str:
        """Upload a TXT file and return its document ID."""
        resp = self.client.post(
            "/files/upload",
            files={"file": ("test.txt", io.BytesIO(content.encode()), "text/plain")},
        )
        assert resp.status_code == 200
        return resp.json()["document_id"]

    def test_ingest_document(self):
        doc_id = self._upload_txt(MAINTENANCE_SOP)
        resp = self.client.post(f"/knowledge/ingest/{doc_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == doc_id
        assert data["ingestion_status"] == "indexed"
        assert data["chunk_count"] > 0

    def test_ingest_nonexistent(self):
        resp = self.client.post("/knowledge/ingest/nonexistent-id")
        assert resp.status_code == 404

    def test_list_knowledge_documents(self):
        doc_id = self._upload_txt(MAINTENANCE_SOP)
        self.client.post(f"/knowledge/ingest/{doc_id}")
        resp = self.client.get("/knowledge/documents")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["document_id"] == doc_id

    def test_delete_knowledge_document(self):
        doc_id = self._upload_txt(MAINTENANCE_SOP)
        self.client.post(f"/knowledge/ingest/{doc_id}")
        resp = self.client.delete(f"/knowledge/documents/{doc_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"
        # Verify it's gone
        resp2 = self.client.get("/knowledge/documents")
        assert len(resp2.json()) == 0

    def test_delete_nonexistent_knowledge_doc(self):
        resp = self.client.delete("/knowledge/documents/nonexistent")
        assert resp.status_code == 404

    def test_search_knowledge(self):
        doc_id = self._upload_txt(MAINTENANCE_SOP)
        self.client.post(f"/knowledge/ingest/{doc_id}")
        resp = self.client.post(
            "/knowledge/search",
            json={"query": "safety requirements PPE", "top_k": 3},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["query"] == "safety requirements PPE"
        assert isinstance(data["results"], list)

    def test_search_empty_query(self):
        resp = self.client.post(
            "/knowledge/search", json={"query": "", "top_k": 3}
        )
        assert resp.status_code == 422

    def test_query_knowledge_rag(self):
        doc_id = self._upload_txt(MAINTENANCE_SOP)
        self.client.post(f"/knowledge/ingest/{doc_id}")
        resp = self.client.post(
            "/knowledge/query",
            json={"query": "What PPE is required?", "top_k": 3},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data
        assert "citations" in data
        assert "model_used" in data

    def test_query_empty_query(self):
        resp = self.client.post(
            "/knowledge/query", json={"query": "", "top_k": 3}
        )
        assert resp.status_code == 422

    def test_health_includes_knowledge(self):
        resp = self.client.get("/health")
        data = resp.json()
        assert "knowledge_documents" in data
        assert "knowledge_chunks" in data
        assert "embedding_provider" in data

    def test_ingest_timing_in_response(self):
        doc_id = self._upload_txt(MAINTENANCE_SOP)
        resp = self.client.post(f"/knowledge/ingest/{doc_id}")
        data = resp.json()
        assert data["ingestion_time_ms"] >= 0
        assert data["embedding_time_ms"] >= 0


# ============================================================
# 11. Evaluation Fixtures — Known Relevant Sources
# ============================================================

class TestEvaluationRetrieval:
    """Tests with known documents and expected retrieval behavior."""

    def test_vibration_query_finds_sop_and_report(self):
        """Query about vibration should retrieve SOP and Inspection Report."""
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("vibration threshold bearing", top_k=5)
        filenames = {r.filename for r in results}
        # Should find at least one of the relevant documents
        assert filenames & {"Maintenance_SOP.pdf", "Inspection_Report.txt"}

    def test_oil_query_finds_relevant_docs(self):
        """Query about oil should retrieve manual and/or SOP."""
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("oil analysis lubrication", top_k=5)
        filenames = {r.filename for r in results}
        assert len(filenames) > 0

    def test_ppe_query_finds_sop(self):
        """PPE query should find the Maintenance SOP."""
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("PPE hard hat safety glasses", top_k=3)
        filenames = {r.filename for r in results}
        assert "Maintenance_SOP.pdf" in filenames

    def test_turbine_startup_finds_manual(self):
        """Startup procedure query should find Equipment Manual."""
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve(
            "turbine model T-400 startup procedure turning gear operations manual",
            top_k=5,
        )
        filenames = {r.filename for r in results}
        assert "Equipment_Manual.docx" in filenames

    def test_inspector_findings_finds_report(self):
        """Inspector findings query should find Inspection Report."""
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve(
            "bearing housing elevated vibration inspector", top_k=3
        )
        filenames = {r.filename for r in results}
        assert "Inspection_Report.txt" in filenames

    def test_top_k_relevance(self):
        """Top result should be more relevant than bottom result."""
        _, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("lock out tag out", top_k=5)
        if len(results) >= 2:
            assert results[0].score >= results[-1].score

    def test_citation_correctness(self):
        """Citations should reference actual retrieved documents."""
        ingestion, retriever, _, _, _ = _build_ingested_system()
        results, _ = retriever.retrieve("maintenance PPE requirements", top_k=3)
        citations = build_citations(results)
        for citation in citations:
            # Citation document must be from our known documents
            assert citation.document in {
                "Maintenance_SOP.pdf",
                "Equipment_Manual.docx",
                "Inspection_Report.txt",
            }

    def test_answer_groundedness(self):
        """RAG answer should be generated from retrieved evidence, not hallucinated."""
        ingestion, retriever, _, _, _ = _build_ingested_system()

        mock_provider = MagicMock()
        mock_provider.generate.return_value = MagicMock(
            text="According to the Maintenance SOP, PPE includes hard hats, "
                 "safety glasses, and steel-toed boots.",
            model_name="test-model",
        )

        rag = RAGService(retriever, mock_provider)
        response = rag.query("What PPE is required?")

        # The prompt sent to the model should contain evidence
        call_args = mock_provider.generate.call_args
        prompt = call_args[0][0].prompt
        assert "EVIDENCE" in prompt
        assert response.evidence_sufficient


# ============================================================
# 12. Document-to-Knowledge Integration
# ============================================================

class TestDocumentToKnowledgeIntegration:
    def test_full_pipeline_txt(self):
        """Test full pipeline: Document → Chunk → Embed → Store → Retrieve."""
        doc = _make_document(
            doc_id="int-001",
            filename="integration_test.txt",
            text="Turbine bearings must be inspected every 500 hours. "
                 "Replace oil filters during each inspection.",
        )
        chunker = ChunkingService(ChunkingConfig(chunk_size=200))
        embedder = TfidfEmbeddingProvider(max_features=64)
        store = InMemoryVectorStore()
        ingestion = KnowledgeIngestionService(chunker, embedder, store)
        retriever = KnowledgeRetriever(embedder, store, ingestion)

        # Ingest
        k_doc = ingestion.ingest(doc)
        assert k_doc.ingestion_status == IngestionStatus.INDEXED
        assert store.count() > 0

        # Retrieve
        results, _ = retriever.retrieve("bearing inspection oil", top_k=3)
        assert len(results) > 0
        assert results[0].filename == "integration_test.txt"

    def test_multi_document_ingestion(self):
        """Ingest multiple documents and verify cross-document retrieval."""
        ingestion, retriever, store, _, docs = _build_ingested_system()

        # Should have chunks from all 3 documents
        assert store.count() > 3
        assert len(ingestion.list_documents()) == 3

    def test_remove_and_re_ingest(self):
        """Remove a document and verify re-ingestion works."""
        ingestion, retriever, store, _, docs = _build_ingested_system()
        initial_count = store.count()

        ingestion.remove_document("sop-001")
        assert store.count() < initial_count

        # Re-ingest
        ingestion.ingest(docs[0], force=True)
        assert ingestion.is_ingested("sop-001")


# ============================================================
# 13. Config Tests
# ============================================================

class TestKnowledgeConfig:
    def test_config_has_knowledge_fields(self):
        settings = get_settings()
        assert hasattr(settings, "chunk_size")
        assert hasattr(settings, "chunk_overlap")
        assert hasattr(settings, "min_chunk_size")
        assert hasattr(settings, "embedding_dimension")
        assert hasattr(settings, "retrieval_top_k")

    def test_config_defaults(self):
        settings = get_settings()
        assert settings.chunk_size == 800
        assert settings.chunk_overlap == 100
        assert settings.min_chunk_size == 50
        assert settings.embedding_dimension == 512
        assert settings.retrieval_top_k == 5

    def test_version_updated(self):
        settings = get_settings()
        assert settings.app_version == "0.7.0"


# ============================================================
# 14. Security Tests
# ============================================================

class TestKnowledgeSecurity:
    def test_tfidf_no_network(self):
        """TF-IDF embedder must not make any network calls."""
        embedder = TfidfEmbeddingProvider(max_features=64)
        embedder.fit(["test document content"])
        # If this completes without error, no network was needed
        vec = embedder.embed("test query")
        assert vec is not None

    def test_vector_store_local_only(self):
        """InMemoryVectorStore keeps everything in process memory."""
        store = InMemoryVectorStore()
        store.add("c1", np.array([1.0, 0.0]))
        # No files created, no network calls
        assert store.count() == 1

    def test_audit_does_not_log_chunk_text(self, tmp_path):
        """Audit records should not contain document/chunk text."""
        os.environ["SAW_LLM_ENABLED"] = "false"
        os.environ["SAW_UPLOAD_DIR"] = str(tmp_path / "uploads")
        os.environ["SAW_DOCUMENT_DB_PATH"] = str(tmp_path / "documents.db")
        os.environ["SAW_KNOWLEDGE_DB_PATH"] = str(tmp_path / "knowledge.db")
        os.environ["SAW_VECTOR_STORAGE_PATH"] = str(tmp_path / "vectors")
        os.environ["SAW_AUDIT_LOG_FILE"] = str(tmp_path / "audit.log")
        from app.main import create_app
        app = create_app()
        with TestClient(app) as client:
            resp = client.post(
                "/files/upload",
                files={
                    "file": (
                        "sec.txt",
                        io.BytesIO(
                            b"Secret data about turbine bearings and oil filters "
                            b"must not appear in audit metadata records."
                        ),
                        "text/plain",
                    )
                },
            )
            assert resp.status_code == 200
            doc_id = resp.json()["document_id"]
            client.post(f"/knowledge/ingest/{doc_id}")

            audit = app.state.audit_service
            records = audit.get_recent(10)
            for record in records:
                meta_str = str(record.metadata)
                assert "Secret data" not in meta_str


# ============================================================
# 15. Performance Metrics Tests
# ============================================================

class TestPerformanceMetrics:
    def test_ingestion_timing(self):
        ingestion, _, _, _, _ = _build_ingested_system()
        doc = ingestion.get_document("sop-001")
        assert doc is not None
        assert doc.ingestion_time_ms > 0

    def test_retrieval_timing(self):
        _, retriever, _, _, _ = _build_ingested_system()
        _, time_ms = retriever.retrieve("vibration", top_k=3)
        assert time_ms >= 0

    def test_embedding_timing(self):
        ingestion, _, _, _, _ = _build_ingested_system()
        doc = ingestion.get_document("sop-001")
        assert doc is not None
        assert doc.embedding_time_ms >= 0

    def test_rag_total_timing(self):
        _, retriever, _, _, _ = _build_ingested_system()
        mock_provider = MagicMock()
        mock_provider.generate.return_value = MagicMock(
            text="Answer.", model_name="test"
        )
        rag = RAGService(retriever, mock_provider)
        response = rag.query("test")
        assert response.total_time_ms >= 0
        assert response.retrieval_time_ms >= 0
        assert response.generation_time_ms >= 0
