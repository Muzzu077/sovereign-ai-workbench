# Sovereign AI Workbench

**SIH 2026 — Problem ID 26117**

Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work.

## Purpose

A self-hosted, air-gap-capable AI workbench that enables confidential industrial organizations to leverage open-weight multimodal LLMs for agentic task execution — without any data leaving the premises.

The system is designed to support:

- Multiple open-weight AI models with automatic task-based selection
- Agentic multi-step task execution with planning and tool use
- Local file reading/writing and sandboxed code execution
- RAG over internal documents, SOPs, and manuals
- OCR for scanned documents
- Multimodal understanding (images, drawings, photographs)
- Generation of deliverables (DOCX, PPTX, XLSX)
- Full audit logging and execution traces
- Visible proof of air-gap compliance (no external network calls)

## Current Architecture (v0.5.0 — Knowledge Base & RAG)

```
User / Client
  │
  ├─► POST /files/upload ──► DocumentStore ──► ProcessorRegistry ──► Document
  │                                                  │
  │                                     ┌────────────┼────────────┐
  │                                     ▼            ▼            ▼
  │                                TxtProcessor PdfProcessor DocxProcessor
  │                                                  │
  │                                                  ▼ (if scanned / empty text)
  │                                            OcrProcessor (Tesseract)
  │
  ├─► POST /knowledge/ingest/{id} ──► ChunkingService ──► TF-IDF Embeddings
  │                                          │                    │
  │                                          ▼                    ▼
  │                                   KnowledgeChunks      InMemoryVectorStore
  │
  ├─► POST /knowledge/search ──► KnowledgeRetriever ──► ranked chunks + provenance
  │
  ├─► POST /knowledge/query ──► RAGService ──► retrieve → prompt → local LLM → answer + citations
  │
  ├─► POST /documents/{id}/analyze ──► DocumentStore ──► Local LLM (Gemma 3 via llama.cpp)
  │
  └─► POST /agent/run ──► Agent Orchestrator ──► Model Registry ──► Local Model
                              │
                              └─► knowledge_search tool ──► KnowledgeRetriever
```

### Key Components

| Module | Role |
|---|---|
| `backend/app/main.py` | FastAPI entry point; wires document + knowledge subsystems |
| `backend/app/config.py` | Settings incl. chunk_size/overlap, embedding_dimension, retrieval_top_k |
| `backend/app/documents/*` | Document Intelligence (TXT/PDF/DOCX/OCR, DocumentStore) |
| `backend/app/knowledge/models.py` | `KnowledgeDocument`, `KnowledgeChunk`, `RetrievalResult`, `Citation`, `RAGResponse` |
| `backend/app/knowledge/chunking.py` | Paragraph/sentence chunking with page/section provenance |
| `backend/app/knowledge/embeddings.py` | `EmbeddingProvider` ABC (swap-in for neural embeddings later) |
| `backend/app/knowledge/tfidf_embeddings.py` | Local TF-IDF embeddings via scikit-learn (no network/GPU) |
| `backend/app/knowledge/memory_store.py` | In-process vector store (numpy cosine similarity) |
| `backend/app/knowledge/ingestion.py` | Chunk → embed → index pipeline with duplicate prevention |
| `backend/app/knowledge/retrieval.py` | Query embedding + ranked retrieval with provenance |
| `backend/app/knowledge/citations.py` | Citation builder (dedupe by filename/page/section) |
| `backend/app/knowledge/rag_service.py` | Retrieve → grounded prompt → local LLM → answer + citations |
| `backend/app/api/knowledge.py` | Ingest / search / query / list / delete knowledge endpoints |
| `backend/app/tools/rag_tool.py` | `knowledge_search` agent tool |
| `backend/app/models/llama_cpp_provider.py` | Local-only llama.cpp provider with air-gap enforcement |
| `backend/app/security/audit.py` | Audit logging (metadata only; no chunk/document text) |

## Getting Started

### Prerequisites

- Python 3.11+

### Setup

```bash
# Clone the repository
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

- Root: `GET /`
- Health: `GET /health`
- Run agent: `POST /agent/run`
- List models: `GET /models/`
- Upload document: `POST /files/upload`
- List uploaded documents: `GET /files/`
- Get document details: `GET /files/{id}`
- Delete document: `DELETE /files/{id}`
- Analyze document: `POST /documents/{id}/analyze`
- Ingest into knowledge base: `POST /knowledge/ingest/{document_id}`
- Search knowledge: `POST /knowledge/search`
- RAG query: `POST /knowledge/query`
- List knowledge docs: `GET /knowledge/documents`
- Delete knowledge doc: `DELETE /knowledge/documents/{document_id}`
- API docs: `GET /docs`

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

### Upload a Document (TXT, PDF, DOCX)

```bash
curl -X POST http://localhost:8000/files/upload \
  -F "file=@/path/to/safety_report.pdf"
```

Response:
```json
{
  "id": "a1b2c3d4-...",
  "filename": "safety_report.pdf",
  "file_type": "pdf",
  "size_bytes": 1048576,
  "status": "text_extracted",
  "page_count": 5,
  "character_count": 12400,
  "has_ocr_content": false,
  "created_at": "2026-09-08T12:00:00Z"
}
```

### Analyze Document via Local LLM

```bash
curl -X POST http://localhost:8000/documents/a1b2c3d4-.../analyze \
  -H "Content-Type: application/json" \
  -d '{"instruction": "Focus on critical safety hazards and immediate remediation steps."}'
```

Response:
```json
{
  "document_id": "a1b2c3d4-...",
  "filename": "safety_report.pdf",
  "model_used": "gemma-3-4b-it",
  "summary": "The document outlines inspection results for Unit 4 turbine bearings...",
  "key_findings": [
    "Vibration level exceeds baseline by 34%",
    "Lubrication oil contamination detected in sample B"
  ],
  "risks": [
    "High risk of bearing seizure if operated continuously above 3000 RPM"
  ],
  "action_items": [
    "Schedule emergency bearing inspection within 48 hours",
    "Replace oil filter and flush lubrication lines"
  ],
  "raw_response": "...",
  "execution_time_ms": 420.5
}
```

### Run Agent Task

```bash
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "Analyze an inspection report"}'
```

### Ingest Document into Knowledge Base

```bash
curl -X POST http://localhost:8000/knowledge/ingest/a1b2c3d4-...
```

### Search Knowledge Base

```bash
curl -X POST http://localhost:8000/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "vibration threshold bearing", "top_k": 5}'
```

### RAG Query (retrieve + local LLM answer + citations)

```bash
curl -X POST http://localhost:8000/knowledge/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What PPE is required for maintenance?", "top_k": 5}'
```

## Knowledge Base & RAG Pipeline

1. **Chunking**: Paragraph/sentence-aware splits (`chunk_size=800`, `overlap=100`) with page/section provenance and deterministic chunk IDs.
2. **Embeddings**: Local TF-IDF via scikit-learn (`TfidfEmbeddingProvider`, default 512 dims). No model download, no GPU, no network. `EmbeddingProvider` ABC allows drop-in replacement with sentence-transformers later.
3. **Vector store**: `InMemoryVectorStore` — numpy cosine similarity, in-process only.
4. **Ingestion**: Document → chunk → embed → index; duplicate prevention and force re-index.
5. **Retrieval**: Query embed → top-k ranked chunks with filename/page/section provenance.
6. **Citations**: Deduplicated by `(filename, page, section)`.
7. **RAG**: Grounded prompt → Gemma 3 (llama.cpp) or DummyLocalModel → answer + citations; insufficient-evidence handling when KB is empty.

## Supported Document Formats & Pipeline

- **Plain Text (`.txt`)**: UTF-8 and Latin-1 support with character truncation controls.
- **PDF (`.pdf`)**: Native text extraction via `pypdf` with per-page tracking; automatic fallback to OCR for scanned/image-only PDFs.
- **Word (`.docx`)**: Structured paragraph extraction and document core properties metadata via `python-docx`.
- **Scanned Documents (OCR)**: Local OCR using Tesseract 5.x and `pdf2image` (Poppler) preserving per-page confidence scores. Zero external API calls.

## Security & Privacy Controls

- **Air-Gap Enforcement**: `LlamaCppProvider` strictly rejects non-loopback URLs (`127.0.0.1`, `localhost`, `[::1]`).
- **Local-only embeddings/store**: TF-IDF and in-memory vector store require zero network.
- **File Ingestion Security**: Path traversal prevention (`sanitize_filename`), file size limits (50 MB default), PDF page limits (200 pages default), character extraction limits (500k chars default), and extension whitelist enforcement.
- **Audit Logging**: Uploads, ingest, query, and delete are logged as metadata only — never chunk/document body text.

## Current Limitations

- TF-IDF is lexical (no paraphrase/cross-lingual semantics); neural embeddings deferred until offline install is available.
- Vector store is in-memory only (not durable across restarts).
- Multi-step agentic planning with automatic tool invocation
- Sandboxed code execution
- Document generation (export to DOCX, PPTX, XLSX)
- Multimodal vision model integration (direct image tokens)
- Web-based frontend UI
- Role-based access control and authentication

## Future Phases

1. **Neural Embeddings** — Offline sentence-transformers when network/packages allow
2. **Persistent Vector Store** — Disk-backed local index
3. **Agentic Planning** — Multi-step task decomposition and tool use
4. **Multimodal Support** — Image/drawing understanding via vision models
5. **Security Hardening** — Network monitoring, air-gap proof, auth
6. **Frontend** — Web UI for task submission and result viewing
7. **Deployment** — Docker, on-premise packaging, air-gapped install

## License

TBD
