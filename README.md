# Sovereign AI Workbench

**SIH 2026 — Problem ID 26117**

Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work.

## Purpose

A self-hosted, air-gap-capable AI workbench that enables confidential industrial organizations to leverage open-weight multimodal LLMs for agentic task execution — without any data leaving the premises.

The system is designed to support:

- Multiple open-weight AI models with automatic task-based selection
- Agentic multi-step task execution with planning, tool invocation, and deterministic verification
- Local file reading/writing and sandboxed execution
- Persistent, air-gapped Knowledge Base & RAG over internal documents, SOPs, and equipment manuals
- Optical Character Recognition (OCR) for scanned documents via local Tesseract
- Multimodal understanding (drawings, schematics, photos)
- Generation of deliverables (DOCX, PPTX, XLSX)
- Tamper-evident audit logging, latency breakdown, and execution traces
- Verified air-gap compliance (strictly zero external network calls)

## Current Architecture (v0.6.0 — Hardened Knowledge Base & RAG)

```
User / Client / Industrial Agent
  │
  ├─► POST /files/upload ──► DocumentStore ──► ProcessorRegistry ──► Document
  │                                                  │
  │                                     ┌────────────┼────────────┐
  │                                     ▼            ▼            ▼
  │                                TxtProcessor PdfProcessor DocxProcessor
  │                                                  │
  │                                                  ▼ (if scanned / image-only)
  │                                            OcrProcessor (Local Tesseract 5.x)
  │
  ├─► POST /knowledge/ingest/{id} ──► IngestionService (SHA-256 content deduplication)
  │                                          │
  │                                          ├─► ChunkingService (paragraph/section splits + chunk hashes)
  │                                          ├─► TfidfEmbeddingProvider (versioned, max_features=512)
  │                                          ├─► KnowledgeMetadataStore (SQLite WAL: knowledge.db)
  │                                          └─► PersistentVectorStore (.npz matrix + JSON mappings)
  │
  ├─► POST /knowledge/search ──► KnowledgeRetriever (cosine sim + threshold + provenance)
  │                                          │
  │                                          └─► deterministic EvidenceQuality classification
  │
  ├─► POST /knowledge/query ──► RAGService (evidence bounds + grounded prompt + citations)
  │                                          │
  │                                          └─► Local LLM (LlamaCppProvider / DummyLocalModel)
  │
  ├─► POST /documents/{id}/analyze ──► DocumentStore ──► Local LLM (Gemma 3 via llama.cpp)
  │
  └─► POST /agent/run ──► Agent Orchestrator ──► Task Router ──► Planner ──► Execution Engine
                               │
                               ├─► CalculatorTool & CalculatorVerifier
                               ├─► FileReaderTool (path traversal protected)
                               └─► KnowledgeSearchTool ──► KnowledgeRetriever
```

### Key Components

| Module | Role |
|---|---|
| `backend/app/main.py` | FastAPI entry point; wires persistent storage, document processors, knowledge services, and agent registries |
| `backend/app/config.py` | Central configuration with persistent paths (`SAW_KNOWLEDGE_DB_PATH`, `SAW_VECTOR_STORAGE_PATH`), chunking settings, and retrieval thresholds |
| `backend/app/documents/*` | Document Intelligence (TXT/PDF/DOCX/OCR, DocumentStore, sanitization) |
| `backend/app/knowledge/models.py` | Domain models (`KnowledgeDocument`, `KnowledgeChunk`, `EvidenceQuality`, `EmbeddingConfig`, `RAGMetrics`, `Citation`, `RAGResponse`) |
| `backend/app/knowledge/persistence.py` | `KnowledgeMetadataStore` — SQLite-backed metadata persistence in WAL mode with foreign key cascade, indexing, and embedding fingerprint tracking |
| `backend/app/knowledge/persistent_store.py` | `PersistentVectorStore` — NumPy `.npz` vector matrix storage + metadata persistence surviving restarts |
| `backend/app/knowledge/chunking.py` | Paragraph/sentence chunking with page/section provenance and deterministic chunk hashes |
| `backend/app/knowledge/embeddings.py` | `EmbeddingProvider` ABC with explicit versioning and `EmbeddingConfig` compatibility |
| `backend/app/knowledge/tfidf_embeddings.py` | Local TF-IDF embeddings via scikit-learn (512 dims, zero network, zero GPU) |
| `backend/app/knowledge/ingestion.py` | Ingestion pipeline with SHA-256 deduplication, state transitions (`PROCESSING`, `INDEXED`, `FAILED`, `STALE`), and stale vector cleanup |
| `backend/app/knowledge/retrieval.py` | Query embedding, cosine search, similarity threshold filtering, and deterministic `classify_evidence` logic |
| `backend/app/knowledge/citations.py` | Provenance citation builder (deduplication by filename, page number, and section) |
| `backend/app/knowledge/rag_service.py` | RAG service with context truncation bounds, evidence quality prompt branch, and end-to-end metrics |
| `backend/app/knowledge/evaluation.py` | Synthetic industrial retrieval evaluation dataset and benchmarking framework (Recall@K, Precision@K) |
| `backend/app/api/knowledge.py` | Knowledge API endpoints for ingestion, search, query, listing, and deletion |
| `backend/app/tools/rag_tool.py` | `knowledge_search` agent tool for the orchestrator |
| `backend/app/models/llama_cpp_provider.py` | Local-only llama.cpp provider with air-gap loopback enforcement |
| `backend/app/security/audit.py` | Tamper-evident audit logging (metadata only; never logs raw chunk or document bodies) |

## Getting Started

### Prerequisites

- Python 3.11+
- Tesseract OCR (optional, for scanned documents/images)

### Setup

```bash
# Clone repository
git clone <repo-url>
cd sovereign-ai-workbench

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate    # Linux/macOS
# venv\Scripts\activate     # Windows

# Install dependencies
pip install -r backend/requirements.txt
```

### Run the Backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.

- Root status: `GET /`
- System health: `GET /health`
- Agent execution: `POST /agent/run`
- Model registry: `GET /models/`
- Upload document: `POST /files/upload`
- List documents: `GET /files/`
- Analyze document: `POST /documents/{id}/analyze`
- Ingest into KB: `POST /knowledge/ingest/{document_id}`
- Search KB: `POST /knowledge/search`
- RAG query: `POST /knowledge/query`
- List KB documents: `GET /knowledge/documents`
- Delete KB document: `DELETE /knowledge/documents/{document_id}`
- Interactive OpenAPI docs: `GET /docs`

### Run Tests

From the project root:

```bash
pytest
```

Or with verbose output:

```bash
pytest -v
```

## API Examples

### Health Check

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-09-11T12:00:00Z",
  "version": "0.6.0",
  "models_registered": ["general"],
  "tools_registered": ["calculator", "file_reader"],
  "document_processors": [".txt", ".pdf", ".docx"],
  "knowledge_documents": 4,
  "knowledge_chunks": 18,
  "embedding_provider": "tfidf-512"
}
```

### Upload a Document (TXT, PDF, DOCX)

```bash
curl -X POST http://localhost:8000/files/upload \
  -F "file=@/path/to/Maintenance_SOP.pdf"
```

### Ingest Document into Knowledge Base

```bash
curl -X POST http://localhost:8000/knowledge/ingest/a1b2c3d4-...
```

Response:
```json
{
  "document_id": "a1b2c3d4-...",
  "filename": "Maintenance_SOP.pdf",
  "file_type": "pdf",
  "content_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "chunk_count": 6,
  "ingestion_status": "indexed",
  "embedding_provider": "tfidf-512",
  "embedding_version": 1,
  "ingested_at": "2026-09-11T12:01:00Z",
  "ingestion_time_ms": 14.2,
  "embedding_time_ms": 5.1
}
```

### Search Knowledge Base

```bash
curl -X POST http://localhost:8000/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "vibration threshold bearing", "top_k": 5, "similarity_threshold": 0.05}'
```

### RAG Query (Grounded Answer + Citations + Quality Metrics)

```bash
curl -X POST http://localhost:8000/knowledge/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the maximum allowable vibration before immediate inspection?", "top_k": 3, "similarity_threshold": 0.05}'
```

Response:
```json
{
  "query": "What is the maximum allowable vibration before immediate inspection?",
  "answer": "If vibration exceeds 4.5 mm/s RMS, schedule immediate inspection.",
  "citations": [
    {
      "document_id": "a1b2c3d4-...",
      "document": "Maintenance_SOP.pdf",
      "page": 1,
      "section": "5. CORRECTIVE ACTIONS",
      "chunk_id": "a1b2c3d4::4",
      "relevance_score": 0.62
    }
  ],
  "model_used": "gemma-3-4b-it",
  "retrieval_count": 1,
  "retrieval_time_ms": 2.4,
  "generation_time_ms": 340.1,
  "total_time_ms": 344.2,
  "evidence_sufficient": true,
  "evidence_quality": "strong_evidence",
  "embedding_time_ms": 0.0,
  "context_construction_time_ms": 0.8,
  "similarity_threshold": 0.05,
  "candidates_count": 1
}
```

## Hardened Knowledge Base & RAG Architecture

1. **Persistent SQLite Metadata**: `knowledge.db` stores document statuses (`PROCESSING`, `INDEXED`, `FAILED`, `STALE`), chunk spans, page numbers, sections, hashes, and embedding fingerprints with WAL mode enabled.
2. **Persistent NumPy Vectors**: `PersistentVectorStore` manages dense embedding matrices stored as `.npz` with corresponding metadata mappings, atomic file writes, and corrupted storage recovery.
3. **Deterministic Deduplication**: Ingestion computes SHA-256 text hashes. Duplicate uploads skip re-embedding; modified documents purge stale vectors before re-indexing.
4. **Embedding Versioning & Fingerprinting**: `EmbeddingConfig` captures provider name, model identifier, version, and dimension. Any incompatible embedding change triggers automatic marking of documents as `STALE`.
5. **Retrieval Thresholding & Quality Classification**:
   - `NO_EVIDENCE`: No chunks retrieved or all scores below threshold. The RAG pipeline refuses to fabricate answers.
   - `WEAK_EVIDENCE`: Top score between weak and sufficient thresholds. Prompts include cautionary grounding.
   - `SUFFICIENT_EVIDENCE`: At least one chunk meets operational confidence.
   - `STRONG_EVIDENCE`: Multiple independent chunks exhibit high similarity scores.
6. **Citation Provenance Integrity**: Citations strictly reference actual chunks retrieved and included in the prompt, deduplicated by `(filename, page, section)`.
7. **Synthetic Evaluation Testbed**: `backend/app/knowledge/evaluation.py` provides deterministic regression benchmarks verifying Recall@K and Precision@K on industrial SOPs and manuals.

## Security & Privacy Controls

- **Air-Gap Enforcement**: `LlamaCppProvider` strictly accepts only loopback URLs (`127.0.0.1`, `localhost`, `[::1]`). External addresses and cloud endpoints are rejected at instantiation.
- **Strictly Local Vectors & Embeddings**: All embeddings (TF-IDF), vector computations (NumPy), and metadata storage (SQLite) operate entirely in-process and on-disk without network calls.
- **Path Traversal Protection**: All file operations enforce workspace boundaries and sanitized filenames.
- **Audit Logging**: Uploads, ingestions, RAG queries, and deletions record metadata, timestamps, and run identifiers. Document text and chunk bodies are never written to audit logs.

## Current Limitations

- TF-IDF embedding provider is lexical; semantic/neural embedding support (e.g., local ONNX / sentence-transformers) will be added once bundled offline model weights are integrated.
- Sandboxed code execution engine is under development for subsequent releases.
- Deliverable export (DOCX, PPTX, XLSX generation) is scheduled for upcoming phases.

## License

TBD
