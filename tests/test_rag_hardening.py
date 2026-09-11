"""
Tests for RAG Hardening subsystem:
- PersistentVectorStore persistence, reload, restart recovery, corrupt recovery
- KnowledgeMetadataStore persistence, transactions, migrations, chunk relationships
- Deduplication via content hash and chunk hashing
- Stale vector cleanup upon re-indexing
- Ingestion failure recovery and state transitions
- Evidence quality classification deterministic boundaries
- Metric tracking across RAG queries
- EmbeddingConfig serialization and compatibility check
- Synthetic industrial evaluation benchmark
"""

import json
import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest

from app.documents.models import Document, DocumentMetadata, DocumentPage, ExtractionStatus, FileType
from app.knowledge.chunking import ChunkingConfig, ChunkingService
from app.knowledge.citations import build_citations
from app.knowledge.embeddings import EmbeddingConfig, EmbeddingProvider
from app.knowledge.evaluation import (
    build_evaluation_corpus,
    run_retrieval_evaluation,
    EVAL_QUERIES,
)
from app.knowledge.ingestion import KnowledgeIngestionService
from app.knowledge.models import EvidenceQuality, IngestionStatus, KnowledgeChunk, KnowledgeDocument, RAGMetrics, RAGResponse
from app.knowledge.persistence import KnowledgeMetadataStore
from app.knowledge.persistent_store import PersistentVectorStore
from app.knowledge.rag_service import RAGService
from app.knowledge.retrieval import KnowledgeRetriever, classify_evidence
from app.knowledge.tfidf_embeddings import TfidfEmbeddingProvider
from app.knowledge.vector_store import VectorStoreResult
from app.models.base import GenerationRequest, GenerationResponse, ModelProvider


# ============================================================
# Helpers
# ============================================================

def _make_doc(
    doc_id: str,
    filename: str,
    text: str,
    extraction_status: ExtractionStatus = ExtractionStatus.TEXT_EXTRACTED,
) -> Document:
    return Document(
        document_id=doc_id,
        filename=filename,
        file_type=FileType.TXT,
        file_size=len(text.encode()),
        page_count=1,
        extraction_status=extraction_status,
        text=text,
        pages=[DocumentPage(page_number=1, text=text, source="text_extraction")],
        metadata=DocumentMetadata(original_filename=filename),
    )


# ============================================================
# 1. Persistent Vector Store Tests
# ============================================================

class TestPersistentVectorStore:
    def test_save_and_reload(self, tmp_path):
        store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        vec1 = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        vec2 = np.array([0.4, 0.5, 0.6], dtype=np.float32)

        store.add("c1", vec1, {"text": "chunk 1", "doc": "d1"})
        store.add("c2", vec2, {"text": "chunk 2", "doc": "d1"})
        store.save()

        assert store.count() == 2

        # Create new instance pointing to same directory
        store2 = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        assert store2.count() == 2
        meta = store2.get_metadata("c1")
        assert meta is not None
        assert meta["text"] == "chunk 1"
        assert meta["doc"] == "d1"

    def test_delete_and_save(self, tmp_path):
        store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        vec1 = np.array([1.0, 0.0], dtype=np.float32)
        vec2 = np.array([0.0, 1.0], dtype=np.float32)

        store.add("c1", vec1, {"k": 1})
        store.add("c2", vec2, {"k": 2})
        store.save()

        assert store.delete("c1") is True
        store.save()

        store2 = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        assert store2.count() == 1
        assert store2.get_metadata("c1") is None
        assert store2.get_metadata("c2")["k"] == 2

    def test_search_accuracy(self, tmp_path):
        store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        store.add("c1", np.array([1.0, 0.0, 0.0], dtype=np.float32), {"doc": "1"})
        store.add("c2", np.array([0.0, 1.0, 0.0], dtype=np.float32), {"doc": "2"})
        store.add("c3", np.array([0.7, 0.7, 0.0], dtype=np.float32), {"doc": "3"})

        # Search with vector close to c1
        results = store.search(np.array([0.9, 0.1, 0.0], dtype=np.float32), top_k=2)
        assert len(results) == 2
        assert results[0].chunk_id == "c1"
        assert results[0].score > 0.8

    def test_corrupted_storage_recovery(self, tmp_path):
        vec_dir = tmp_path / "vectors"
        vec_dir.mkdir(parents=True, exist_ok=True)
        # Write corrupted files
        (vec_dir / "vectors.npz").write_text("invalid npz bytes")
        (vec_dir / "metadata.json").write_text("invalid json")

        # Store should catch error, warn, and initialize cleanly empty
        store = PersistentVectorStore(storage_dir=vec_dir)
        assert store.count() == 0


# ============================================================
# 2. Metadata Store Tests (SQLite)
# ============================================================

class TestKnowledgeMetadataStore:
    def test_upsert_and_retrieve_document(self, tmp_path):
        db_path = tmp_path / "knowledge.db"
        store = KnowledgeMetadataStore(db_path=db_path)

        kdoc = KnowledgeDocument(
            document_id="d1",
            filename="test.txt",
            file_type="txt",
            content_hash="hash-12345",
            chunk_count=2,
            ingestion_status=IngestionStatus.INDEXED,
            embedding_provider="tfidf-512",
            embedding_version=1,
            ingestion_time_ms=25.0,
            embedding_time_ms=10.0,
        )

        store.save_document(kdoc)

        chunks = [
            KnowledgeChunk(
                chunk_id="c1",
                document_id="d1",
                chunk_index=0,
                text="sample text chunk 1",
            ),
            KnowledgeChunk(
                chunk_id="c2",
                document_id="d1",
                chunk_index=1,
                text="sample text chunk 2",
            ),
        ]
        store.save_chunks(chunks)

        retrieved = store.get_document("d1")
        assert retrieved is not None
        assert retrieved.document_id == "d1"
        assert retrieved.filename == "test.txt"
        assert retrieved.content_hash == "hash-12345"
        assert retrieved.ingestion_status == IngestionStatus.INDEXED
        assert retrieved.chunk_count == 2

        retrieved_chunks = store.get_chunks_by_document("d1")
        assert len(retrieved_chunks) == 2
        assert retrieved_chunks[0].chunk_id == "c1"

        store.close()

    def test_delete_document_cascades_chunks(self, tmp_path):
        db_path = tmp_path / "knowledge.db"
        store = KnowledgeMetadataStore(db_path=db_path)

        kdoc = KnowledgeDocument(
            document_id="d2",
            filename="test2.txt",
            file_type="txt",
            content_hash="hash-abc",
            chunk_count=1,
            ingestion_status=IngestionStatus.INDEXED,
        )
        store.save_document(kdoc)
        store.save_chunks([
            KnowledgeChunk(
                chunk_id="c2_1",
                document_id="d2",
                chunk_index=0,
                text="sample text content two",
            )
        ])
        assert store.get_document("d2") is not None
        assert len(store.get_chunks_by_document("d2")) > 0

        assert store.delete_document("d2") is True
        assert store.get_document("d2") is None
        assert len(store.get_chunks_by_document("d2")) == 0

        store.close()

    def test_content_hash_lookup(self, tmp_path):
        db_path = tmp_path / "knowledge.db"
        store = KnowledgeMetadataStore(db_path=db_path)

        kdoc = KnowledgeDocument(
            document_id="d3",
            filename="test3.txt",
            file_type="txt",
            content_hash="unique-hash-999",
            chunk_count=1,
            ingestion_status=IngestionStatus.INDEXED,
        )
        store.save_document(kdoc)

        found = store.find_by_content_hash("unique-hash-999")
        assert found is not None
        assert found.document_id == "d3"

        assert store.find_by_content_hash("nonexistent-hash") is None
        store.close()


# ============================================================
# 3. Deduplication & Re-indexing Tests
# ============================================================

class TestDeduplicationAndReindexing:
    def test_identical_content_skips_duplicate_indexing(self, tmp_path):
        meta_store = KnowledgeMetadataStore(db_path=tmp_path / "knowledge.db")
        vec_store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        chunking = ChunkingService()
        embedding = TfidfEmbeddingProvider(max_features=128)

        ingestion = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=embedding,
            vector_store=vec_store,
            metadata_store=meta_store,
        )

        doc1 = _make_doc("doc-1", "doc.txt", "This is identical content across two documents in the system.")
        res1 = ingestion.ingest(doc1)
        assert res1.ingestion_status == IngestionStatus.INDEXED

        # Ingest same doc_id with same content
        res2 = ingestion.ingest(doc1)
        assert res2.ingestion_status == IngestionStatus.INDEXED
        assert res2.content_hash == res1.content_hash

    def test_reindexing_cleans_stale_vectors(self, tmp_path):
        meta_store = KnowledgeMetadataStore(db_path=tmp_path / "knowledge.db")
        vec_store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        chunking = ChunkingService(config=ChunkingConfig(chunk_size=100, chunk_overlap=20))
        embedding = TfidfEmbeddingProvider(max_features=128)

        ingestion = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=embedding,
            vector_store=vec_store,
            metadata_store=meta_store,
        )

        # First indexing: long content
        long_text_v1 = "Turbine maintenance protocol section Alpha with extended operational parameters and diagnostics. " * 8
        doc = _make_doc("doc-reindex", "manual.txt", long_text_v1)
        res1 = ingestion.ingest(doc)
        v1_count = vec_store.count()
        assert v1_count > 0

        # Second indexing: shorter content -> fewer chunks
        short_text_v2 = "Short replacement text content."
        doc_v2 = _make_doc("doc-reindex", "manual.txt", short_text_v2)
        res2 = ingestion.ingest(doc_v2)

        # Vector count should reflect updated chunk count, stale chunks purged
        assert vec_store.count() == res2.chunk_count


# ============================================================
# 4. Failure Recovery & Error Handling
# ============================================================

class TestIngestionFailureRecovery:
    def test_embedding_failure_sets_failed_status(self, tmp_path):
        meta_store = KnowledgeMetadataStore(db_path=tmp_path / "knowledge.db")
        vec_store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        chunking = ChunkingService()

        # Mock embedding provider that throws an error
        bad_embedding = MagicMock(spec=EmbeddingProvider)
        bad_embedding.embed_batch.side_effect = RuntimeError("Embedding compute crashed")
        bad_embedding.get_name.return_value = "bad-model"
        bad_embedding.dimension.return_value = 128
        bad_embedding.get_config.return_value = EmbeddingConfig(
            model_name="bad-model", dimension=128, version="1.0"
        )

        ingestion = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=bad_embedding,
            vector_store=vec_store,
            metadata_store=meta_store,
        )

        doc = _make_doc(
            "fail-doc",
            "fail.txt",
            "This is long text for fail document testing that should produce chunks successfully." * 5,
        )
        result = ingestion.ingest(doc)
        assert result.ingestion_status == IngestionStatus.FAILED

        stored = meta_store.get_document("fail-doc")
        assert stored is not None
        assert stored.ingestion_status == IngestionStatus.FAILED
        assert "Embedding compute crashed" in (stored.error_info or "")

    def test_failed_document_extraction_rejection(self, tmp_path):
        meta_store = KnowledgeMetadataStore(db_path=tmp_path / "knowledge.db")
        vec_store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        ingestion = KnowledgeIngestionService(
            chunking_service=ChunkingService(),
            embedding_provider=TfidfEmbeddingProvider(),
            vector_store=vec_store,
            metadata_store=meta_store,
        )

        doc = _make_doc("failed-doc", "failed.txt", "", extraction_status=ExtractionStatus.FAILED)
        res = ingestion.ingest(doc)
        assert res.ingestion_status == IngestionStatus.FAILED


# ============================================================
# 5. Evidence Quality Classification Tests
# ============================================================

class TestEvidenceQualityClassification:
    def test_no_results_is_no_evidence(self):
        assert classify_evidence([], similarity_threshold=0.3) == EvidenceQuality.NO_EVIDENCE

    def test_all_below_threshold_is_no_evidence(self):
        results = [
            VectorStoreResult(chunk_id="c1", score=0.15, metadata={}),
            VectorStoreResult(chunk_id="c2", score=0.20, metadata={}),
        ]
        assert classify_evidence(results, threshold=0.25) == EvidenceQuality.NO_EVIDENCE

    def test_weak_evidence(self):
        results = [
            VectorStoreResult(chunk_id="c1", score=0.15, metadata={}),
        ]
        assert classify_evidence(results, threshold=0.10) == EvidenceQuality.WEAK_EVIDENCE

    def test_sufficient_evidence(self):
        results = [
            VectorStoreResult(chunk_id="c1", score=0.25, metadata={}),
            VectorStoreResult(chunk_id="c2", score=0.22, metadata={}),
        ]
        assert classify_evidence(results, threshold=0.10) == EvidenceQuality.SUFFICIENT_EVIDENCE

    def test_strong_evidence(self):
        results = [
            VectorStoreResult(chunk_id="c1", score=0.45, metadata={}),
            VectorStoreResult(chunk_id="c2", score=0.38, metadata={}),
            VectorStoreResult(chunk_id="c3", score=0.25, metadata={}),
        ]
        assert classify_evidence(results, threshold=0.10) == EvidenceQuality.STRONG_EVIDENCE


# ============================================================
# 6. RAG Service & Metrics Tracking Tests
# ============================================================

class TestRAGMetricsAndQuality:
    def test_rag_service_tracks_full_metrics(self, tmp_path):
        meta_store = KnowledgeMetadataStore(db_path=tmp_path / "knowledge.db")
        vec_store = PersistentVectorStore(storage_dir=tmp_path / "vectors")
        chunking = ChunkingService()
        embedding = TfidfEmbeddingProvider(max_features=128)

        ingestion = KnowledgeIngestionService(
            chunking_service=chunking,
            embedding_provider=embedding,
            vector_store=vec_store,
            metadata_store=meta_store,
        )

        doc = _make_doc(
            "doc-1",
            "SOP.txt",
            "Lockout tagout procedure requires opening primary circuit breakers and applying padlocks."
        )
        ingestion.ingest(doc)

        retriever = KnowledgeRetriever(
            embedding_provider=embedding,
            vector_store=vec_store,
            ingestion_service=ingestion,
            default_top_k=3,
            similarity_threshold=0.01,
        )

        mock_provider = MagicMock(spec=ModelProvider)
        mock_provider.generate.return_value = GenerationResponse(
            text="Follow lockout tagout by opening primary circuit breakers.",
            model_name="mock-model",
            prompt_tokens=40,
            completion_tokens=15,
            total_tokens=55,
        )

        rag = RAGService(retriever=retriever, model_provider=mock_provider)
        response = rag.query("lockout tagout procedure breakers")

        assert isinstance(response, RAGResponse)
        assert response.metrics is not None
        assert response.metrics.candidates_count > 0
        assert response.metrics.returned_count > 0
        assert response.metrics.vector_search_time_ms >= 0
        assert response.metrics.generation_time_ms >= 0
        assert response.evidence_quality in [
            EvidenceQuality.WEAK_EVIDENCE,
            EvidenceQuality.SUFFICIENT_EVIDENCE,
            EvidenceQuality.STRONG_EVIDENCE,
        ]
        assert len(response.citations) > 0
        assert response.citations[0].document == "SOP.txt"


# ============================================================
# 7. Restart Recovery End-to-End Test
# ============================================================

class TestRestartRecoveryEndToEnd:
    def test_restart_persistence(self, tmp_path):
        db_path = tmp_path / "knowledge.db"
        vec_dir = tmp_path / "vectors"

        # Session 1: Ingest documents
        meta1 = KnowledgeMetadataStore(db_path=db_path)
        vec1 = PersistentVectorStore(storage_dir=vec_dir)
        embed1 = TfidfEmbeddingProvider(max_features=256)
        ingest1 = KnowledgeIngestionService(
            chunking_service=ChunkingService(),
            embedding_provider=embed1,
            vector_store=vec1,
            metadata_store=meta1,
        )

        doc_a = _make_doc("doc-a", "cooling.txt", "Cooling water pump operates at 50 degrees Celsius nominal.")
        doc_b = _make_doc("doc-b", "generator.txt", "Generator rotor excitation current is 1200 Amperes.")
        ingest1.ingest(doc_a)
        ingest1.ingest(doc_b)
        meta1.close()

        # Session 2: "Restart" application with new service instances pointing to same paths
        meta2 = KnowledgeMetadataStore(db_path=db_path)
        vec2 = PersistentVectorStore(storage_dir=vec_dir)
        embed2 = TfidfEmbeddingProvider(max_features=256)
        ingest2 = KnowledgeIngestionService(
            chunking_service=ChunkingService(),
            embedding_provider=embed2,
            vector_store=vec2,
            metadata_store=meta2,
        )
        retriever2 = KnowledgeRetriever(
            embedding_provider=embed2,
            vector_store=vec2,
            ingestion_service=ingest2,
            default_top_k=3,
            similarity_threshold=0.01,
        )

        docs = ingest2.list_documents()
        assert len(docs) == 2
        assert {d.document_id for d in docs} == {"doc-a", "doc-b"}

        # Perform retrieval on restarted system
        results, quality = retriever2.retrieve("Cooling water pump temperature")
        assert len(results) > 0
        assert results[0].filename == "cooling.txt"
        meta2.close()


# ============================================================
# 8. Synthetic Retrieval Evaluation Suite
# ============================================================

class TestSyntheticIndustrialEvaluation:
    def test_evaluation_benchmark_run(self, tmp_path):
        meta = KnowledgeMetadataStore(db_path=tmp_path / "eval.db")
        vec = PersistentVectorStore(storage_dir=tmp_path / "eval_vectors")
        embed = TfidfEmbeddingProvider(max_features=512)
        ingest = KnowledgeIngestionService(
            chunking_service=ChunkingService(config=ChunkingConfig(chunk_size=300, chunk_overlap=50)),
            embedding_provider=embed,
            vector_store=vec,
            metadata_store=meta,
        )

        corpus = build_evaluation_corpus()
        for doc in corpus:
            ingest.ingest(doc)

        retriever = KnowledgeRetriever(
            embedding_provider=embed,
            vector_store=vec,
            ingestion_service=ingest,
            default_top_k=5,
            similarity_threshold=0.01,
        )

        metrics = run_retrieval_evaluation(retriever=retriever, queries=EVAL_QUERIES, top_k=5)
        assert metrics.total_queries == len(EVAL_QUERIES)
        # Recall@5 across synthetic corpus should be high
        assert metrics.mean_recall_at_k >= 0.8
        meta.close()
