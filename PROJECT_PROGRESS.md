# Sovereign AI Workbench — Complete Project Progress Report

**SIH 2026 — Problem ID 26117**
**Branch:** `feature/rag-hardening`
**Current Version:** `0.6.0`
**Date:** September 11, 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Git History & Development Timeline](#2-git-history--development-timeline)
3. [Phase 1 — Foundation (v0.1.0)](#3-phase-1--foundation-v010)
4. [Phase 2 — Controlled Agent Core (v0.3.0)](#4-phase-2--controlled-agent-core-v030)
5. [Phase 3 — Document Intelligence (v0.4.0)](#5-phase-3--document-intelligence-v040)
6. [Phase 4 — Knowledge Base & RAG Pipeline (v0.5.0)](#6-phase-4--knowledge-base--rag-pipeline-v050)
7. [Phase 5 — RAG Hardening (v0.6.0)](#7-phase-5--rag-hardening-v060)
8. [Complete File Inventory](#8-complete-file-inventory)
9. [Full API Reference](#9-full-api-reference)
10. [Data Models & Schemas](#10-data-models--schemas)
11. [Configuration Reference](#11-configuration-reference)
12. [Test Suite Summary](#12-test-suite-summary)
13. [Dependencies](#13-dependencies)
14. [Security & Air-Gap Compliance](#14-security--air-gap-compliance)
15. [Current Limitations](#15-current-limitations)
16. [Future Implementation Phases](#16-future-implementation-phases)

---

## 1. Project Overview

The Sovereign AI Workbench is a self-hosted, air-gap-capable AI workbench that enables confidential industrial organizations to leverage open-weight multimodal LLMs for agentic task execution — with zero data leaving the premises.

**Core Principles:**

- Strictly local execution: no cloud APIs, no telemetry, no external vector databases
- Open-weight models only (Gemma 3 via llama.cpp)
- Deterministic agent control: the application orchestrates tools, not the LLM
- Industrial-grade document processing with OCR for scanned documents
- Persistent, hardened Knowledge Base with retrieval quality guarantees
- Tamper-evident audit logging (metadata only, never document bodies)

---

## 2. Git History & Development Timeline

```
7e57bed  Create directory for sovereign-ai-workbench
82913ef  Add sovereign AI workbench                                    ← Phase 1: Foundation
6a0e629  feat: add controlled agent core                               ← Phase 2: Agent Core
830adb4  Add knowledge RAG document intelligence                       ← Phase 3+4: Documents + RAG
c791964  Merge feature/agent-core into feature/rag-hardening
227f94c  Merge feature/knowledge-rag into feature/rag-hardening
ea2c9b4  fix: update version assertion to 0.6.0 after merge
7a25c5e  feat(rag): harden persistent storage, evidence quality, ...   ← Phase 5: RAG Hardening
```

**Branches:**

| Branch | Status | Purpose |
|--------|--------|---------|
| `main` | Stable | Foundation baseline |
| `feature/agent-core` | Merged | Controlled agent orchestration |
| `feature/knowledge-rag` | Merged | Document intelligence + RAG pipeline |
| `feature/rag-hardening` | Active (HEAD) | Persistent storage, evidence quality, evaluation |

---

## 3. Phase 1 — Foundation (v0.1.0)

**Commit:** `82913ef` — *Add sovereign AI workbench*
**Branch:** `main`

### What Was Built

The foundational scaffolding for the entire workbench: FastAPI backend, configuration system, model provider abstraction, security stubs, and the initial test harness.

### Components Implemented

#### 3.1 FastAPI Application (`backend/app/main.py`)

- Root endpoint (`GET /`) returning service name, version, and status
- Health endpoint (`GET /health`) returning registered models, tools, processors, knowledge stats, and timestamp
- Lifespan-managed application startup (directory creation, service wiring)
- CORS middleware

#### 3.2 Configuration System (`backend/app/config.py`)

- Pydantic `BaseSettings` with `SAW_` environment variable prefix
- `.env` file loading support
- Default paths for data, documents, uploads, sandbox, models, and audit logs
- Server settings (host, port)
- `get_settings()` factory function

#### 3.3 Model Provider Abstraction (`backend/app/models/`)

**Abstract Base (`base.py`):**

| Class | Purpose |
|-------|---------|
| `ModelCapability` | Declares text/vision/code support and context window |
| `ImageInput` | Represents a single image (path or base64) for multimodal input |
| `GenerationRequest` | Input for model generation (prompt, max_tokens, temperature, system_prompt, images) |
| `GenerationResponse` | Output from model generation (text, model_name, tokens_used, metadata) |
| `ModelProvider(ABC)` | Abstract interface: `get_name()`, `get_capabilities()`, `generate()`, `is_available()` |

**Local Dummy Model (`local.py`):**

- `DummyLocalModel(ModelProvider)` — deterministic placeholder that echoes tasks back with a structured summary format
- Returns hardcoded responses for testing without a running llama.cpp server

**Model Registry (`registry.py`):**

- `ModelRegistry` — maps model names to `ModelProvider` instances
- Methods: `register()`, `get()`, `list_models()`, `has()`

**llama.cpp Provider (`llama_cpp_provider.py`):**

- `LlamaCppProvider(ModelProvider)` — connects to a local llama.cpp HTTP server
- Air-gap enforcement: validates URL is strictly loopback (`127.0.0.1`, `localhost`, `[::1]`) at instantiation
- Raises `LlamaCppSecurityError` for non-loopback URLs
- Multimodal support: encodes images as base64 for vision models
- Configurable timeout, temperature, max_tokens
- Health check via `GET /health` on the llama.cpp server

#### 3.4 Security Layer (`backend/app/security/`)

- `AuditService` — JSON-lines audit log recording task, model, status, and metadata (never document bodies)
- `AuditRecord` — Pydantic model with timestamp, task, selected_model, execution_status, metadata
- `NetworkMonitor` — placeholder stub for future OS-level network compliance monitoring

#### 3.5 Initial Test Suite (`tests/test_foundation.py`)

- 7 test classes, 25 test functions
- Covers: config defaults, model provider ABC, dummy model generation, model registry, LlamaCppProvider security validation, audit logging, health endpoint

---

## 4. Phase 2 — Controlled Agent Core (v0.3.0)

**Commit:** `6a0e629` — *feat: add controlled agent core*
**Branch:** `feature/agent-core`

### What Was Built

A deterministic, controlled agent pipeline where the application (not the LLM) decides which tools to invoke, in what order, and with what verification. The LLM is used only for final natural-language generation.

### Architecture

```
Task (natural language)
  │
  ▼
TaskRouter (keyword-based, deterministic)
  │
  ▼
TaskPlanner (rule-based, deterministic)
  │
  ▼
AgentExecutor (sequential tool execution)
  │
  ├─► CalculatorTool ──► CalculatorVerifier (independent re-computation)
  ├─► FileReaderTool (path-traversal protected)
  └─► (future tools)
  │
  ▼
VerifierRegistry (post-execution verification)
  │
  ▼
ModelProvider.generate() (final LLM response)
  │
  ▼
OrchestratorResult (full execution trace)
```

### Components Implemented

#### 4.1 Tool Framework (`backend/app/tools/`)

**Abstract Base (`base.py`):**

| Class | Purpose |
|-------|---------|
| `ToolInput(BaseModel)` | Empty base for structured tool input |
| `ToolResult(BaseModel)` | Result with `success`, `result`, `error`, `metadata` |
| `Tool(ABC)` | Interface: `name`, `description`, `input_schema`, `execute()` |

**Tool Registry (`registry.py`):**

- `ToolRegistry` — maps tool names to `Tool` instances
- Methods: `register()`, `get()`, `list_tools()`, `has()`

**Calculator Tool (`calculator.py`):**

- `CalculatorTool(Tool)` — safe arithmetic evaluation
- Parses expressions into Python AST and walks nodes manually — **no `eval()` or `exec()` ever**
- Whitelist-only operators: `+`, `-`, `*`, `/`, `//`, `%`, `**`, `()`, unary `-`, unary `+`
- Only allows numeric literals (int/float) — rejects identifiers, function calls, imports, strings
- Exponent cap: `_MAX_EXPONENT = 1000` prevents DoS
- Overflow guard: checks `math.isfinite()` after every operation
- Result normalization: `4.0` becomes `4` when lossless

**File Reader Tool (`file_reader.py`):**

- `FileReaderTool(Tool)` — reads `.txt`, `.pdf`, `.docx` files
- Path traversal prevention via `resolved.relative_to(workspace_root)`
- Extension whitelist enforcement
- Lazy imports for `pypdf`, `python-docx` with `ImportError` guards
- Graceful degradation: returns `status="ocr_required"` for scanned PDFs

#### 4.2 Agent Pipeline (`backend/app/agents/`)

**Task Router (`router.py`):**

- `TaskRouter` — deterministic keyword-based routing (no LLM)
- Routes (priority order):

| Condition | task_type | confidence | tools_hint |
|-----------|-----------|------------|------------|
| Both calc + file keywords | `"multi_step"` | `1.0` | `["file_reader", "calculator"]` |
| Connector phrase present | `"multi_step"` | `0.9` | subset |
| Calc keywords only | `"calculation"` | `1.0` | `["calculator"]` |
| File keywords only | `"file_analysis"` | `1.0` | `["file_reader"]` |
| No match / empty | `"general"` | `0.5` | `[]` |

- Calc keywords: `calculate, compute, add, subtract, multiply, divide, sum, average, mean, total, percentage, percent, math, arithmetic, what is \d+, how much is`
- File keywords: `read, open, load, file, document, pdf, docx, txt, extract, content of, contents of, text from, data from`
- Multi-step connectors: `and then, then, after that, also, and calculate, and compute, and read, and summarize, and extract, and find`

**Task Planner (`planner.py`):**

- `TaskPlanner` — deterministic rule-based planner (no LLM)
- Produces an `ExecutionPlan` with ordered `PlanStep` entries
- Planning logic by task type:
  - `"calculation"` → single `calculator` step with extracted expression
  - `"file_analysis"` → single `file_reader` step with extracted file path
  - `"multi_step"` → ordered `file_reader` then `calculator` with dependency chain
  - `"general"` → empty steps (LLM-only)
- Validates all steps reference registered tools; raises `PlanValidationError` otherwise

**Agent Executor (`executor.py`):**

- `AgentExecutor` — sequential execution of `ExecutionPlan` steps
- Resolves tools via `ToolRegistry`
- Passes context between steps (e.g., file content flows into calculator)
- Stops on first unrecoverable failure
- Runs verification after each tool execution
- Emits trace events for every stage

**Verifier Framework (`verifier.py`):**

- `Verifier(ABC)` — abstract interface with `tool_name` property and `verify()` method
- `CalculatorVerifier` — independently re-computes arithmetic expressions using a fresh `CalculatorTool` instance
- `VerifierRegistry` — maps tool names to verifiers; returns `NOT_VERIFIED` for tools without a verifier
- Verification statuses: `PASS`, `FAIL`, `NOT_VERIFIED`

**Execution Trace (`trace.py`):**

- `ExecutionTrace` — collects ordered `TraceEvent` entries during execution
- 10 event types: `TASK_RECEIVED`, `TASK_ROUTED`, `PLAN_CREATED`, `TOOL_STARTED`, `TOOL_COMPLETED`, `TOOL_FAILED`, `VERIFICATION_STARTED`, `VERIFICATION_COMPLETED`, `TASK_COMPLETED`, `TASK_FAILED`
- Each event has timestamp (UTC), run_id, event_type, optional step_id, and metadata

**Orchestrator (`orchestrator.py`):**

- `AgentOrchestrator` — top-level pipeline coordinator
- Pipeline: Task → Router → Planner → Executor → Verifier → LLM → Result
- The model does NOT execute tools directly
- Returns `OrchestratorResult` with: `run_id`, `task`, `task_type`, `selected_model`, `provider`, `execution_status`, `plan`, `tool_calls`, `verification`, `result`, `trace`
- Records audit entry via `AuditService` after every execution

#### 4.3 API Endpoint

- `POST /agent/run` — accepts `{"task": "..."}`, runs the full orchestrator pipeline, returns `OrchestratorResult`

#### 4.4 Test Suite (`tests/test_agent_core.py`)

- 19 test classes, 98 test functions
- Covers: tool base classes, calculator safety (AST parsing, overflow, exponent cap, operator whitelist), file reader security (path traversal, workspace confinement), tool registry, task router (all route types, edge cases), planner (all task types, validation), executor (sequential execution, failure handling, context passing), verifier (re-computation, mismatch detection), orchestrator (end-to-end pipeline), trace events, agent API endpoint

---

## 5. Phase 3 — Document Intelligence (v0.4.0)

**Commit:** `830adb4` — *Add knowledge RAG document intelligence*
**Branch:** `feature/knowledge-rag`

### What Was Built

A complete document processing pipeline supporting TXT, PDF, DOCX, and scanned document OCR — all operating locally without any external API calls.

### Components Implemented

#### 5.1 Document Models (`backend/app/documents/models.py`)

| Model | Purpose |
|-------|---------|
| `FileType(Enum)` | Supported formats: `txt`, `pdf`, `docx` |
| `ExtractionStatus(Enum)` | Lifecycle states: `TEXT_EXTRACTED`, `OCR_REQUIRED`, `OCR_COMPLETED`, `FAILED`, `UNSUPPORTED` |
| `DocumentPage` | Single page: `page_number`, `text`, `source`, `confidence` |
| `DocumentMetadata` | File metadata: original/stored filename, MIME type, encoding, author, title, extras |
| `Document` | Normalized document: `document_id`, `filename`, `file_type`, `file_size`, `page_count`, `extraction_status`, `text`, `pages`, `metadata`, `created_at` |

#### 5.2 Document Processors (`backend/app/documents/`)

**Abstract Base (`processor.py`):**

- `DocumentProcessor(ABC)` — interface with `supported_extensions` property and `process()` method
- `ProcessorRegistry` — maps extensions to processors; methods: `register()`, `get()`, `has()`, `list_extensions()`
- `ProcessingError` — controlled failure exception

**TXT Processor (`txt_processor.py`):**

- UTF-8 and Latin-1 encoding support with fallback
- Character truncation controls (`max_characters`)
- Single-page representation

**PDF Processor (`pdf_processor.py`):**

- Native text extraction via `pypdf` with per-page tracking
- Page limit enforcement (`max_pages`, default 200)
- Character extraction limit (`max_characters`, default 500k)
- Automatic detection of scanned/image-only PDFs → sets `OCR_REQUIRED` status

**DOCX Processor (`docx_processor.py`):**

- Structured paragraph extraction via `python-docx`
- Document core properties metadata (author, title)
- Full text concatenation with paragraph separation

**OCR Processor (`ocr_processor.py`):**

- Local OCR using Tesseract 5.x via `pytesseract`
- PDF-to-image conversion via `pdf2image` (Poppler `pdftoppm`)
- Per-page OCR confidence scores via `image_to_data()`
- Configurable DPI (default 300), page limits, character limits
- `is_available()` static method checks for system binaries
- Custom exceptions: `OcrUnavailableError`, `OcrError`

#### 5.3 Document Store (`backend/app/documents/store.py`)

- `DocumentStore` — in-memory document index with filesystem backing
- File storage: `upload_dir/<document_id>/<filename>`
- Methods: `generate_id()`, `store_file()`, `save_document()`, `get_document()`, `get_file_path()`, `list_documents()`, `delete_document()`, `update_document()`
- `sanitize_filename()` — strips unsafe characters, collapses underscores, limits to 255 chars

#### 5.4 API Endpoints (`backend/app/api/`)

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| `POST` | `/files/upload` | `upload_file` | Upload TXT/PDF/DOCX, validate, store, extract text, auto-OCR if needed |
| `GET` | `/files/` | `list_files` | List all uploaded documents with metadata and text preview |
| `GET` | `/files/{document_id}` | `get_file` | Get details of a specific document |
| `DELETE` | `/files/{document_id}` | `delete_file` | Delete a document and its stored file |
| `POST` | `/documents/{document_id}/analyze` | `analyze_document` | Analyze document via local Gemma LLM |
| `GET` | `/models/` | `list_models` | List registered model providers with capabilities |
| `GET` | `/models/health` | `models_health` | Per-model health check |

#### 5.5 Agent Tools for Documents

- `DocumentTool` (`backend/app/tools/document_tool.py`) — agent tool for document analysis
- `OcrTool` (`backend/app/tools/ocr_tool.py`) — agent tool for OCR processing
- `CodeTool` (`backend/app/tools/code_tool.py`) — agent tool for code execution (stub)
- `FileTool` (`backend/app/tools/file_tool.py`) — agent tool for file operations (stub)

#### 5.6 Test Suite (`tests/test_document_intelligence.py`)

- 17 test classes, 86 test functions
- Covers: document models, TXT/PDF/DOCX processing, OCR processor, file size/page/character limits, extension whitelist, filename sanitization, document store CRUD, file upload API, document analysis API

#### 5.7 Test Suite (`tests/test_llama_cpp_provider.py`)

- 16 test classes, 62 test functions
- Covers: loopback URL validation, security rejection of external URLs, multimodal image encoding, generation request/response, health checks, timeout handling, provider configuration

---

## 6. Phase 4 — Knowledge Base & RAG Pipeline (v0.5.0)

**Commit:** `830adb4` (same commit as Document Intelligence)
**Branch:** `feature/knowledge-rag`

### What Was Built

A complete local RAG pipeline: document chunking with provenance, TF-IDF embeddings, in-memory vector store, semantic retrieval, citation extraction, and grounded LLM generation — all without any external network calls.

### Architecture

```
Document (from DocumentStore)
  │
  ▼
ChunkingService (paragraph/sentence splits, page/section provenance)
  │
  ▼
TfidfEmbeddingProvider (local scikit-learn, 512 dims)
  │
  ▼
InMemoryVectorStore (numpy cosine similarity)
  │
  ▼
KnowledgeRetriever (query embed → top-k ranked chunks)
  │
  ▼
CitationBuilder (deduplicated by filename, page, section)
  │
  ▼
RAGService (grounded prompt → local LLM → answer + citations)
```

### Components Implemented

#### 6.1 Knowledge Models (`backend/app/knowledge/models.py`)

| Model | Purpose |
|-------|---------|
| `IngestionStatus(Enum)` | Document lifecycle: `PENDING`, `PROCESSING`, `CHUNKED`, `EMBEDDED`, `INDEXED`, `FAILED`, `STALE` |
| `KnowledgeChunk` | Single chunk with: `chunk_id`, `document_id`, `text`, `page_number`, `section`, `source`, `chunk_index`, `start_char`, `end_char`, `chunk_hash`, `vector_id`, `created_at`, `metadata` |
| `KnowledgeDocument` | Document in KB: `document_id`, `filename`, `file_type`, `content_hash`, `chunk_count`, `ingestion_status`, `embedding_provider`, `embedding_version`, timing fields |
| `RetrievalResult` | Search result: `chunk`, `score`, `document_id`, `filename`, `page_number`, `section` |
| `Citation` | Source reference: `document_id`, `document`, `page`, `section`, `chunk_id`, `relevance_score` |
| `RAGResponse` | Full response: `query`, `answer`, `citations`, `model_used`, timing fields, `evidence_sufficient` |

#### 6.2 Chunking Service (`backend/app/knowledge/chunking.py`)

- `ChunkingConfig` dataclass: `chunk_size=800`, `chunk_overlap=100`, `min_chunk_size=50`
- `ChunkingService` — paragraph/sentence-aware splitting
- Deterministic chunk IDs: `{document_id}::{chunk_index}`
- Section detection via heading patterns
- Page number tracking from `Document.pages`
- Character span tracking (`start_char`, `end_char`)

#### 6.3 Embedding Layer (`backend/app/knowledge/embeddings.py`)

- `EmbeddingProvider(ABC)` — abstract interface with `embed_text()`, `embed_batch()`, `get_dimension()`, `get_config()`
- Versioning support via `EmbeddingConfig` dataclass

#### 6.4 TF-IDF Embeddings (`backend/app/knowledge/tfidf_embeddings.py`)

- `TfidfEmbeddingProvider(EmbeddingProvider)` — local embeddings via scikit-learn `TfidfVectorizer`
- Default 512 dimensions (`max_features=512`)
- Zero network, zero GPU, zero model download
- `_safe_fit()` with threshold relaxation for small corpora (≤10 documents)
- `fit()` / `is_fitted` state management
- Batch embedding for ingestion efficiency

#### 6.5 Vector Store (`backend/app/knowledge/vector_store.py`, `memory_store.py`)

- `VectorStore(ABC)` — abstract interface: `add()`, `add_batch()`, `search()`, `delete()`, `delete_by_document()`, `count()`, `clear()`
- `VectorStoreResult` — result with `chunk_id`, `score`, `metadata` (uses `__slots__`)
- `InMemoryVectorStore(VectorStore)` — numpy-based cosine similarity, in-process only, suitable for ~100k chunks

#### 6.6 Ingestion Service (`backend/app/knowledge/ingestion.py`)

- `KnowledgeIngestionService` — full pipeline: Document → chunk → embed → index
- Duplicate prevention via content checking
- Force re-index support
- State transitions: `PENDING` → `PROCESSING` → `CHUNKED` → `EMBEDDED` → `INDEXED`
- Error handling with `FAILED` state and error_info recording

#### 6.7 Retrieval Service (`backend/app/knowledge/retrieval.py`)

- `KnowledgeRetriever` — query embedding → vector search → ranked results
- Top-k retrieval with filename/page/section provenance
- Similarity threshold filtering

#### 6.8 Citation Builder (`backend/app/knowledge/citations.py`)

- `build_citations()` — constructs `Citation` objects from `RetrievalResult` list
- Deduplication by `(filename, page_number, section)` tuple

#### 6.9 RAG Service (`backend/app/knowledge/rag_service.py`)

- `RAGService` — full RAG pipeline: retrieve → build prompt → generate → extract citations
- Grounded prompt construction with context from retrieved chunks
- Insufficient-evidence handling when KB is empty or no relevant chunks found
- Timing metrics: retrieval, generation, total

#### 6.10 Knowledge Search Tool (`backend/app/tools/rag_tool.py`)

- `KnowledgeSearchTool` — allows the agent orchestrator to query the KB during task execution
- Returns results with provenance: filename, page, section, relevance score
- Registered as `"knowledge_search"` tool

#### 6.11 API Endpoints (`backend/app/api/knowledge.py`)

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| `POST` | `/knowledge/ingest/{document_id}` | `ingest_document` | Ingest a document into the KB |
| `POST` | `/knowledge/search` | `search_knowledge` | Semantic search over the KB |
| `POST` | `/knowledge/query` | `query_knowledge` | RAG query: retrieve + LLM answer + citations |
| `GET` | `/knowledge/documents` | `list_knowledge_documents` | List all KB documents |
| `DELETE` | `/knowledge/documents/{document_id}` | `delete_knowledge_document` | Remove a document from the KB |

#### 6.12 Test Suite (`tests/test_knowledge_rag.py`)

- 19 test classes, 120 test functions
- Covers: chunking (paragraph splits, section detection, page tracking, overlap, min size), TF-IDF embeddings (fitting, dimensionality, batch processing), vector store (add, search, delete, cosine similarity), ingestion pipeline (full flow, duplicate prevention, force re-index, state transitions, error handling), retrieval (top-k, scoring, provenance), citation building (deduplication, completeness), RAG service (grounded generation, insufficient evidence, timing), knowledge API (ingest, search, query, list, delete endpoints), knowledge search tool (agent integration)

---

## 7. Phase 5 — RAG Hardening (v0.6.0)

**Commit:** `7a25c5e` — *feat(rag): harden persistent storage, evidence quality, and evaluation framework*
**Branch:** `feature/rag-hardening`

### What Was Built

Comprehensive hardening of the Knowledge Base and RAG subsystem: persistent SQLite metadata, persistent NumPy vector storage, embedding versioning, retrieval quality controls, evidence quality classification, citation integrity, failure recovery, restart resilience, and a retrieval evaluation framework.

### 7.1 Persistent SQLite Metadata Store (`backend/app/knowledge/persistence.py`)

**Class:** `KnowledgeMetadataStore`

- SQLite database at `data/knowledge_base/knowledge.db`
- WAL (Write-Ahead Logging) mode for concurrent read safety
- Foreign key enforcement with cascade deletes
- Schema with two tables:
  - `knowledge_documents` — document metadata, status, hashes, embedding fingerprints
  - `knowledge_chunks` — chunk text, spans, page numbers, sections, hashes
- Indexes on `content_hash`, `chunk_hash`, `document_id`
- Methods:
  - `save_document()`, `get_document()`, `list_documents()`, `delete_document()`, `update_status()`
  - `save_chunks()`, `get_chunks()`, `get_chunk()`
  - `find_by_content_hash()` / `find_by_hash()` — duplicate detection
  - `update_embedding_info()` — records embedding fingerprint per document
  - `close()` — clean shutdown

### 7.2 Persistent NumPy Vector Store (`backend/app/knowledge/persistent_store.py`)

**Class:** `PersistentVectorStore(VectorStore)`

- Extends the `VectorStore` ABC with filesystem persistence
- Storage directory: `data/knowledge_base/vectors/`
- Files:
  - `vectors.npz` — dense NumPy embedding matrix
  - `metadata.json` — chunk ID ↔ index mappings and per-chunk metadata
- Atomic save: writes to temp files then renames
- Auto-save on every mutation (add, delete, clear)
- Corrupted storage recovery: falls back to empty state on load failure
- `get_metadata(chunk_id)` — retrieve stored metadata for a specific chunk
- Survives process restart: loads vectors and metadata from disk on init

### 7.3 Embedding Versioning & Fingerprinting

**`EmbeddingConfig`** (frozen dataclass in `models.py`):

| Field | Type | Default |
|-------|------|---------|
| `provider` | `str` | `"tfidf"` |
| `version` | `int` | `1` |
| `model_name` | `str` | `""` |
| `dimension` | `int` | `512` |
| `preprocessing_version` | `int` | `1` |

- `fingerprint()` method returns a stable string identifier (e.g., `tfidf-v1--512-pp1`)
- Incompatible embedding changes trigger automatic marking of affected documents as `STALE`
- `TfidfEmbeddingProvider` now generates `EmbeddingConfig` via `get_config()`

### 7.4 Deduplication & Re-indexing

- **Document-level dedup:** SHA-256 hash of full document text (`content_hash`); duplicate uploads are detected and skipped
- **Chunk-level dedup:** SHA-256 hash of chunk text (`chunk_hash`); prevents redundant vector insertions
- **Stale vector cleanup:** When a document is re-indexed, all old chunks and vectors are purged before new ones are inserted
- **State transitions for re-indexing:** `INDEXED` → `STALE` → `PROCESSING` → `INDEXED`

### 7.5 Ingestion Hardening (`backend/app/knowledge/ingestion.py`)

- Content hash computation and duplicate detection via `KnowledgeMetadataStore.find_by_content_hash()`
- Metadata persistence: documents and chunks saved to SQLite after chunking and after indexing
- Embedding fingerprint recording per document
- Failed extraction rejection: documents with `FAILED` extraction status are rejected at ingestion
- Vocabulary refitting on restart: `_load_from_persistence()` reads persisted chunk texts and refits the TF-IDF vocabulary
- Graceful failure recovery: exceptions during ingestion set document status to `FAILED` with error info

### 7.6 Evidence Quality Classification (`backend/app/knowledge/retrieval.py`)

**Function:** `classify_evidence(results, similarity_threshold=0.05, threshold=None)`

Deterministic classification computed in application code (never by the LLM):

| Quality State | Condition |
|---------------|-----------|
| `NO_EVIDENCE` | No results pass the similarity threshold |
| `WEAK_EVIDENCE` | Top score is between threshold and 2× threshold |
| `SUFFICIENT_EVIDENCE` | Top score ≥ 2× threshold, or multiple results above threshold |
| `STRONG_EVIDENCE` | Multiple results with high scores (top score ≥ 3× threshold and ≥2 results above threshold) |

- Accepts both `similarity_threshold` and `threshold` kwargs for backward compatibility
- Filters results by effective threshold before classifying
- Used by `RAGService` to branch prompt construction and set `evidence_sufficient` flag

### 7.7 Retrieval Hardening (`backend/app/knowledge/retrieval.py`)

- Threshold filtering: results below `similarity_threshold` are excluded
- Evidence quality classification attached to every retrieval
- Fallback chunk construction: when a chunk is found in the vector store but not in the memory cache (e.g., after restart), constructs a `KnowledgeChunk` from vector store metadata
- `KnowledgeRetriever.retrieve()` now returns results with evidence quality annotation

### 7.8 RAG Service Hardening (`backend/app/knowledge/rag_service.py`)

- `RAGMetrics` model populated for every RAG request (embedding time, search time, context construction time, generation time, total time, candidates count, returned count, threshold, evidence quality)
- `RAGResponse.metrics` field carries the full `RAGMetrics` object
- Evidence quality prompt branching:
  - `NO_EVIDENCE` → refuses to answer, states no relevant evidence found
  - `WEAK_EVIDENCE` → includes cautionary grounding in prompt
  - `SUFFICIENT_EVIDENCE` / `STRONG_EVIDENCE` → standard grounded prompt
- `_build_rag_prompt()` accepts optional `evidence_quality` and `insufficient` kwargs for backward compatibility
- Context character limit enforcement (`max_context_chars`, default 5000)

### 7.9 Citation Integrity (`backend/app/knowledge/citations.py`)

- Citations strictly reference actual chunks retrieved and included in the LLM prompt
- Deduplication by `(filename, page_number, section)` tuple
- `relevance_score` preserved from retrieval results
- `chunk_id` included for traceability

### 7.10 Retrieval Evaluation Framework (`backend/app/knowledge/evaluation.py`)

- Synthetic industrial dataset with 4 documents:
  - `SOP-001` — Turbine Maintenance Standard Operating Procedure
  - `INSP-002` — Bearing Inspection Protocol
  - `MAN-003` — Turbine Blade Maintenance Manual
  - `PROC-004` — Heat Treatment Procedure
- Pre-defined query-relevance mappings for deterministic regression testing
- `run_retrieval_evaluation()` function:
  - Ingests synthetic documents
  - Runs each query against the retriever
  - Computes Recall@K and Precision@K per query
  - Returns aggregate metrics
- Used by test suite to verify retrieval quality (Recall@5 ≥ 0.8 benchmark)

### 7.11 Application Wiring (`backend/app/main.py`)

- `KnowledgeMetadataStore` instantiated during app lifespan with configurable DB path
- `PersistentVectorStore` instantiated during app lifespan with configurable storage path
- Both stores wired into `KnowledgeIngestionService` and `KnowledgeRetriever`
- Environment variables: `SAW_KNOWLEDGE_DB_PATH`, `SAW_VECTOR_STORAGE_PATH`

### 7.12 API Compatibility (`backend/app/api/knowledge.py`)

- Search and query endpoints now accept optional `similarity_threshold` parameter
- Response bodies include `evidence_quality`, `metrics`, `candidates_count`, `similarity_threshold`
- All existing API contracts preserved (backward compatible)

### 7.13 Test Suite (`tests/test_rag_hardening.py`)

- 8 test classes, 19 test functions
- Covers:

| Test Class | Tests | What It Covers |
|------------|-------|----------------|
| `TestPersistentVectorStore` | 5 | Save/reload, delete, search after reload, corrupted storage recovery |
| `TestKnowledgeMetadataStore` | 4 | Document CRUD, cascade delete, content hash lookup, chunk retrieval |
| `TestDeduplication` | 1 | SHA-256 duplicate detection prevents redundant ingestion |
| `TestReindexStaleCleanup` | 1 | Stale chunk/vector purge on force re-index |
| `TestEmbeddingFailureRecovery` | 1 | Graceful FAILED status on embedding errors |
| `TestFailedExtractionRejection` | 1 | Documents with FAILED extraction are rejected |
| `TestEvidenceQuality` | 3 | NO_EVIDENCE, WEAK_EVIDENCE, STRONG_EVIDENCE boundary classification |
| `TestRAGMetrics` | 1 | RAGMetrics populated with timing and quality data |
| `TestRestartRecovery` | 1 | End-to-end restart recovery (persist → new service instance → retrieve) |
| `TestSyntheticEvaluation` | 1 | Recall@5 ≥ 0.8 benchmark on synthetic industrial dataset |

---

## 8. Complete File Inventory

### Application Code (`backend/app/`)

```
backend/app/
├── __init__.py
├── main.py                          # FastAPI app, lifespan, root/health routes
├── config.py                        # Settings (Pydantic BaseSettings, SAW_ env prefix)
│
├── models/
│   ├── __init__.py
│   ├── base.py                      # ModelProvider ABC, GenerationRequest/Response
│   ├── local.py                     # DummyLocalModel (testing placeholder)
│   ├── llama_cpp_provider.py        # LlamaCppProvider (loopback-only, air-gapped)
│   └── registry.py                  # ModelRegistry
│
├── agents/
│   ├── __init__.py
│   ├── orchestrator.py              # AgentOrchestrator (top-level pipeline)
│   ├── router.py                    # TaskRouter (keyword-based, deterministic)
│   ├── planner.py                   # TaskPlanner (rule-based, deterministic)
│   ├── executor.py                  # AgentExecutor (sequential tool execution)
│   ├── verifier.py                  # Verifier ABC, CalculatorVerifier, VerifierRegistry
│   └── trace.py                     # ExecutionTrace, TraceEvent, EventType
│
├── tools/
│   ├── __init__.py
│   ├── base.py                      # Tool ABC, ToolResult, ToolInput
│   ├── registry.py                  # ToolRegistry
│   ├── calculator.py                # CalculatorTool (AST-based safe math)
│   ├── file_reader.py               # FileReaderTool (path-traversal protected)
│   ├── rag_tool.py                  # KnowledgeSearchTool (agent KB access)
│   ├── document_tool.py             # DocumentTool (agent document analysis)
│   ├── ocr_tool.py                  # OcrTool (agent OCR processing)
│   ├── code_tool.py                 # CodeTool (stub)
│   └── file_tool.py                 # FileTool (stub)
│
├── documents/
│   ├── __init__.py
│   ├── models.py                    # Document, DocumentPage, DocumentMetadata, FileType, ExtractionStatus
│   ├── processor.py                 # DocumentProcessor ABC, ProcessorRegistry
│   ├── store.py                     # DocumentStore (in-memory + filesystem)
│   ├── txt_processor.py             # TxtProcessor
│   ├── pdf_processor.py             # PdfProcessor (pypdf)
│   ├── docx_processor.py            # DocxProcessor (python-docx)
│   └── ocr_processor.py             # OcrProcessor (Tesseract + Poppler)
│
├── knowledge/
│   ├── __init__.py
│   ├── models.py                    # KnowledgeDocument, KnowledgeChunk, EvidenceQuality, EmbeddingConfig, RAGMetrics, RAGResponse, Citation, RetrievalResult
│   ├── chunking.py                  # ChunkingService (paragraph/sentence splits, provenance)
│   ├── embeddings.py                # EmbeddingProvider ABC (versioned interface)
│   ├── tfidf_embeddings.py          # TfidfEmbeddingProvider (scikit-learn, 512 dims)
│   ├── vector_store.py              # VectorStore ABC, VectorStoreResult
│   ├── memory_store.py              # InMemoryVectorStore (numpy cosine similarity)
│   ├── persistent_store.py          # PersistentVectorStore (.npz + JSON, restart-safe)
│   ├── persistence.py               # KnowledgeMetadataStore (SQLite WAL, cascades)
│   ├── ingestion.py                 # KnowledgeIngestionService (dedup, hashing, recovery)
│   ├── retrieval.py                 # KnowledgeRetriever, classify_evidence()
│   ├── citations.py                 # build_citations() (provenance dedup)
│   ├── rag_service.py               # RAGService (grounded prompt, metrics, evidence branching)
│   └── evaluation.py                # Synthetic evaluation dataset, run_retrieval_evaluation()
│
├── api/
│   ├── __init__.py
│   ├── agent.py                     # POST /agent/run
│   ├── files.py                     # POST /files/upload, GET /files/, GET/DELETE /files/{id}
│   ├── documents.py                 # POST /documents/{id}/analyze
│   ├── knowledge.py                 # POST /knowledge/ingest, search, query; GET/DELETE documents
│   └── models.py                    # GET /models/, GET /models/health
│
└── security/
    ├── __init__.py
    ├── audit.py                     # AuditService (JSON-lines, metadata only)
    └── network_monitor.py           # NetworkMonitor (stub for future)
```

### Test Code (`tests/`)

```
tests/
├── __init__.py
├── conftest.py                      # Shared fixtures
├── test_foundation.py               #  25 tests — config, model providers, audit, health
├── test_agent_core.py               #  98 tests — tools, router, planner, executor, verifier, orchestrator
├── test_document_intelligence.py    #  86 tests — document processors, store, file upload, analysis
├── test_llama_cpp_provider.py       #  62 tests — loopback security, multimodal, generation
├── test_knowledge_rag.py            # 120 tests — chunking, embeddings, vector store, ingestion, retrieval, RAG
└── test_rag_hardening.py            #  19 tests — persistence, dedup, recovery, evidence quality, evaluation
```

### Configuration & Project Files

```
pyproject.toml                       # pytest config (testpaths, pythonpath)
backend/requirements.txt            # Python dependencies
README.md                           # Project README
PROJECT_PROGRESS.md                  # This file
```

---

## 9. Full API Reference

### System Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service status (name, version, status) |
| `GET` | `/health` | Health check (models, tools, processors, knowledge stats, timestamp) |

### Agent Endpoints (prefix: `/agent`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/agent/run` | Execute a natural-language task through the full agent pipeline |

### File Endpoints (prefix: `/files`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/files/upload` | Upload a document (TXT/PDF/DOCX) |
| `GET` | `/files/` | List all uploaded documents |
| `GET` | `/files/{document_id}` | Get a specific document's details |
| `DELETE` | `/files/{document_id}` | Delete a document |

### Document Analysis Endpoints (prefix: `/documents`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/documents/{document_id}/analyze` | Analyze a document via local LLM |

### Knowledge Base & RAG Endpoints (prefix: `/knowledge`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/knowledge/ingest/{document_id}` | Ingest a document into the KB (chunk, embed, index) |
| `POST` | `/knowledge/search` | Semantic search over the KB (raw retrieval results) |
| `POST` | `/knowledge/query` | RAG query: retrieve + LLM answer + citations + metrics |
| `GET` | `/knowledge/documents` | List all documents in the KB |
| `DELETE` | `/knowledge/documents/{document_id}` | Remove a document from the KB |

### Model Endpoints (prefix: `/models`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/models/` | List registered model providers with capabilities |
| `GET` | `/models/health` | Per-model health check |

**Total: 14 endpoints across 6 route groups**

---

## 10. Data Models & Schemas

### Document Domain

| Model | Module | Key Fields |
|-------|--------|------------|
| `FileType` | `documents/models.py` | `TXT`, `PDF`, `DOCX` |
| `ExtractionStatus` | `documents/models.py` | `TEXT_EXTRACTED`, `OCR_REQUIRED`, `OCR_COMPLETED`, `FAILED`, `UNSUPPORTED` |
| `DocumentPage` | `documents/models.py` | `page_number`, `text`, `source`, `confidence` |
| `DocumentMetadata` | `documents/models.py` | `original_filename`, `stored_filename`, `mime_type`, `encoding`, `author`, `title`, `extra` |
| `Document` | `documents/models.py` | `document_id`, `filename`, `file_type`, `file_size`, `page_count`, `extraction_status`, `text`, `pages`, `metadata`, `created_at` |

### Knowledge Domain

| Model | Module | Key Fields |
|-------|--------|------------|
| `IngestionStatus` | `knowledge/models.py` | `PENDING`, `PROCESSING`, `CHUNKED`, `EMBEDDED`, `INDEXED`, `FAILED`, `STALE` |
| `EvidenceQuality` | `knowledge/models.py` | `NO_EVIDENCE`, `WEAK_EVIDENCE`, `SUFFICIENT_EVIDENCE`, `STRONG_EVIDENCE` |
| `EmbeddingConfig` | `knowledge/models.py` | `provider`, `version`, `model_name`, `dimension`, `preprocessing_version`, `fingerprint()` |
| `KnowledgeChunk` | `knowledge/models.py` | `chunk_id`, `document_id`, `text`, `page_number`, `section`, `source`, `chunk_index`, `start_char`, `end_char`, `chunk_hash`, `vector_id`, `metadata` |
| `KnowledgeDocument` | `knowledge/models.py` | `document_id`, `filename`, `file_type`, `content_hash`, `chunk_count`, `ingestion_status`, `embedding_provider`, `embedding_version`, timing fields |
| `RetrievalResult` | `knowledge/models.py` | `chunk`, `score`, `document_id`, `filename`, `page_number`, `section` |
| `Citation` | `knowledge/models.py` | `document_id`, `document`, `page`, `section`, `chunk_id`, `relevance_score` |
| `RAGMetrics` | `knowledge/models.py` | `query`, `embedding_time_ms`, `vector_search_time_ms`, `candidates_count`, `returned_count`, `similarity_threshold`, `evidence_quality`, timing fields |
| `RAGResponse` | `knowledge/models.py` | `query`, `answer`, `citations`, `model_used`, timing fields, `evidence_quality`, `metrics` |

### Agent Domain

| Model | Module | Key Fields |
|-------|--------|------------|
| `ModelCapability` | `models/base.py` | `name`, `supports_text`, `supports_vision`, `supports_code`, `max_context_tokens` |
| `GenerationRequest` | `models/base.py` | `prompt`, `max_tokens`, `temperature`, `system_prompt`, `images` |
| `GenerationResponse` | `models/base.py` | `text`, `model_name`, `tokens_used`, `metadata` |
| `RouteResult` | `agents/router.py` | `task_type`, `confidence`, `tools_hint` |
| `PlanStep` | `agents/planner.py` | `step_id`, `tool`, `description`, `input`, `depends_on` |
| `ExecutionPlan` | `agents/planner.py` | `run_id`, `task`, `steps` |
| `StepOutcome` | `agents/executor.py` | `step_id`, `tool`, `tool_result`, `verification` |
| `ExecutionResult` | `agents/executor.py` | `run_id`, `success`, `outcomes`, `error` |
| `VerificationResult` | `agents/verifier.py` | `status`, `tool_name`, `detail` |
| `OrchestratorResult` | `agents/orchestrator.py` | `run_id`, `task`, `task_type`, `selected_model`, `provider`, `execution_status`, `plan`, `tool_calls`, `verification`, `result`, `trace` |
| `TraceEvent` | `agents/trace.py` | `timestamp`, `run_id`, `event_type`, `step_id`, `metadata` |
| `ToolResult` | `tools/base.py` | `success`, `result`, `error`, `metadata` |

---

## 11. Configuration Reference

All settings use the `SAW_` environment variable prefix and can be overridden via `.env` file or environment variables.

| Setting | Env Variable | Type | Default |
|---------|-------------|------|---------|
| `app_name` | `SAW_APP_NAME` | `str` | `"Sovereign AI Workbench"` |
| `app_version` | `SAW_APP_VERSION` | `str` | `"0.6.0"` |
| `debug` | `SAW_DEBUG` | `bool` | `False` |
| **Paths** | | | |
| `data_dir` | `SAW_DATA_DIR` | `Path` | `data` |
| `documents_dir` | `SAW_DOCUMENTS_DIR` | `Path` | `data/documents` |
| `knowledge_base_dir` | `SAW_KNOWLEDGE_BASE_DIR` | `Path` | `data/knowledge_base` |
| `outputs_dir` | `SAW_OUTPUTS_DIR` | `Path` | `data/outputs` |
| `sandbox_dir` | `SAW_SANDBOX_DIR` | `Path` | `sandbox` |
| `models_dir` | `SAW_MODELS_DIR` | `Path` | `models` |
| **Server** | | | |
| `host` | `SAW_HOST` | `str` | `0.0.0.0` |
| `port` | `SAW_PORT` | `int` | `8000` |
| **Audit** | | | |
| `audit_log_file` | `SAW_AUDIT_LOG_FILE` | `Path` | `data/audit.log` |
| **Document Intelligence** | | | |
| `upload_dir` | `SAW_UPLOAD_DIR` | `Path` | `data/uploads` |
| `max_upload_size` | `SAW_MAX_UPLOAD_SIZE` | `int` | `52428800` (50 MB) |
| `max_pdf_pages` | `SAW_MAX_PDF_PAGES` | `int` | `200` |
| `max_extracted_characters` | `SAW_MAX_EXTRACTED_CHARACTERS` | `int` | `500000` |
| `allowed_extensions` | `SAW_ALLOWED_EXTENSIONS` | `list[str]` | `["txt", "pdf", "docx"]` |
| **Local LLM Provider** | | | |
| `llm_provider` | `SAW_LLM_PROVIDER` | `str` | `"llama_cpp"` |
| `llm_base_url` | `SAW_LLM_BASE_URL` | `str` | `http://127.0.0.1:8080` |
| `llm_model_id` | `SAW_LLM_MODEL_ID` | `str` | `"gemma-3-4b-it"` |
| `llm_model_path` | `SAW_LLM_MODEL_PATH` | `str` | `models/gemma-3-4b-it-Q4_K_M.gguf` |
| `llm_mmproj_path` | `SAW_LLM_MMPROJ_PATH` | `str` | `models/mmproj-gemma-3-4b-it-f16.gguf` |
| `llm_timeout` | `SAW_LLM_TIMEOUT` | `int` | `120` |
| `llm_enabled` | `SAW_LLM_ENABLED` | `bool` | `True` |
| **Knowledge Base & RAG** | | | |
| `chunk_size` | `SAW_CHUNK_SIZE` | `int` | `800` |
| `chunk_overlap` | `SAW_CHUNK_OVERLAP` | `int` | `100` |
| `min_chunk_size` | `SAW_MIN_CHUNK_SIZE` | `int` | `50` |
| `embedding_dimension` | `SAW_EMBEDDING_DIMENSION` | `int` | `512` |
| `retrieval_top_k` | `SAW_RETRIEVAL_TOP_K` | `int` | `5` |
| `similarity_threshold` | `SAW_SIMILARITY_THRESHOLD` | `float` | `0.05` |
| `max_context_chars` | `SAW_MAX_CONTEXT_CHARS` | `int` | `5000` |
| **Embedding Provider** | | | |
| `embedding_provider` | `SAW_EMBEDDING_PROVIDER` | `str` | `"tfidf"` |
| `embedding_version` | `SAW_EMBEDDING_VERSION` | `int` | `1` |
| **Persistence** | | | |
| `knowledge_db_path` | `SAW_KNOWLEDGE_DB_PATH` | `Path` | `data/knowledge_base/knowledge.db` |
| `vector_storage_path` | `SAW_VECTOR_STORAGE_PATH` | `Path` | `data/knowledge_base/vectors` |

---

## 12. Test Suite Summary

### Overall Results

```
418 passed, 0 failed in ~4s
```

### Breakdown by File

| File | Test Classes | Test Functions | Focus Area |
|------|-------------|----------------|------------|
| `test_foundation.py` | 7 | 25 | Config, model providers, audit, health endpoint |
| `test_agent_core.py` | 19 | 98 | Tools, router, planner, executor, verifier, orchestrator, agent API |
| `test_document_intelligence.py` | 17 | 86 | Document processors (TXT/PDF/DOCX/OCR), store, file upload/analysis APIs |
| `test_llama_cpp_provider.py` | 16 | 62 | Loopback URL security, multimodal encoding, generation, health checks |
| `test_knowledge_rag.py` | 19 | 120 | Chunking, embeddings, vector store, ingestion, retrieval, citations, RAG, knowledge APIs |
| `test_rag_hardening.py` | 8 | 19 | Persistent storage, dedup, recovery, evidence quality, evaluation benchmark |
| **Total** | **86** | **410** | |

*Note: 8 additional tests come from parameterized/fixture variations, totaling 418 collected by pytest.*

### Key Test Coverage Areas

- **Security:** Path traversal prevention, workspace confinement, loopback URL enforcement, extension whitelist, exponent/overflow guards
- **Persistence:** SQLite CRUD with cascade deletes, NumPy vector save/reload, corrupted storage recovery, restart resilience
- **Correctness:** Calculator AST parsing, chunking provenance, embedding dimensionality, cosine similarity, citation deduplication
- **Edge Cases:** Empty queries, empty KB, duplicate ingestion, failed extraction rejection, large exponents, division by zero, overflow
- **Integration:** End-to-end ingestion→retrieval→RAG pipeline, agent orchestrator pipeline, file upload→process→analyze pipeline
- **Quality:** Retrieval evaluation benchmark (Recall@5 ≥ 0.8), evidence quality classification boundaries

---

## 13. Dependencies

### Core Dependencies (`backend/requirements.txt`)

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | >=0.115.0 | Web framework |
| `uvicorn` | >=0.34.0 | ASGI server |
| `pydantic` | >=2.10.0 | Data validation and serialization |
| `pydantic-settings` | >=2.7.0 | Configuration management with env vars |
| `pytest` | >=8.3.0 | Test framework |
| `httpx` | >=0.28.0 | HTTP client for test client |

### Lazy-Imported Dependencies (optional, guarded by `try/except`)

| Package | System Dependency | Purpose |
|---------|-------------------|---------|
| `pypdf` | — | PDF text extraction |
| `python-docx` | — | DOCX paragraph extraction |
| `pytesseract` | `tesseract-ocr` | OCR text recognition |
| `pdf2image` | `poppler-utils` | PDF-to-image conversion for OCR |
| `Pillow` | — | Image handling for OCR |
| `scikit-learn` | — | TF-IDF vectorizer for embeddings |
| `numpy` | — | Vector operations and cosine similarity |

### System Dependencies (optional)

| Tool | Version | Purpose |
|------|---------|---------|
| Tesseract OCR | 5.x | Scanned document text recognition |
| Poppler (`pdftoppm`) | — | PDF page rendering for OCR |
| llama.cpp server | — | Local LLM inference (Gemma 3) |

---

## 14. Security & Air-Gap Compliance

### Verified Guarantees

| Control | Implementation |
|---------|---------------|
| **No external network calls** | Verified via grep — only `http://127.0.0.1:8080` reference (llama.cpp). No cloud APIs, no telemetry, no remote vector stores |
| **Loopback-only LLM** | `LlamaCppProvider` validates URL against `127.0.0.1`, `localhost`, `[::1]` at instantiation; raises `LlamaCppSecurityError` for all others |
| **Local-only embeddings** | TF-IDF via scikit-learn — pure CPU computation, no model download, no network |
| **Local-only vector storage** | NumPy matrices on filesystem, SQLite metadata on filesystem — zero remote dependencies |
| **Path traversal prevention** | `FileReaderTool` enforces `resolved.relative_to(workspace_root)`; `sanitize_filename()` strips unsafe characters |
| **File size limits** | 50 MB upload limit, 200 page PDF limit, 500k character extraction limit |
| **Extension whitelist** | Only `.txt`, `.pdf`, `.docx` accepted |
| **Audit logging** | Records metadata only (task, model, status, timestamp) — never logs document text or chunk bodies |
| **Calculator safety** | AST-only parsing, no `eval()`/`exec()`, exponent cap, overflow guard |
| **Deterministic agent control** | Application orchestrates tool execution — LLM never invokes tools directly |

---

## 15. Current Limitations

| Area | Limitation | Mitigation Plan |
|------|-----------|-----------------|
| **Embeddings** | TF-IDF is lexical only — no paraphrase or cross-lingual semantics | Neural embeddings (local ONNX / sentence-transformers) planned for offline model weight bundling |
| **Document Store** | `DocumentStore` is in-memory (not durable across restarts) | Knowledge metadata is persistent via SQLite; document store persistence planned |
| **Code Execution** | Sandboxed code execution engine is a stub | Full sandboxed execution planned for subsequent phase |
| **Export** | No deliverable generation (DOCX, PPTX, XLSX) | Export pipeline planned for upcoming phase |
| **Frontend** | No web UI — API-only | Web-based frontend planned |
| **Auth** | No authentication or access control | Role-based access control planned |
| **Network Monitor** | `NetworkMonitor` is a stub | OS-level socket / eBPF monitoring planned |
| **Multi-model** | Only one LLM provider active at a time | Multi-model orchestration and automatic selection planned |
| **Vision** | Multimodal image support implemented in provider but not fully integrated into agent pipeline | Direct image token integration planned |

---

## 16. Future Implementation Phases

### Phase 6 — Neural Embeddings (Planned)

- Offline sentence-transformers or ONNX model bundled with the application
- Drop-in replacement via `EmbeddingProvider` ABC (already designed for this)
- Automatic re-indexing of existing documents when embedding provider changes (stale detection already implemented)
- Cross-lingual and paraphrase-aware retrieval

### Phase 7 — Agentic Planning Enhancement (Planned)

- Multi-step task decomposition with dynamic tool selection
- LLM-assisted planning (currently deterministic rules only)
- Conditional branching in execution plans
- Parallel tool execution where steps are independent
- Memory/context accumulation across plan steps

### Phase 8 — Sandboxed Code Execution (Planned)

- Isolated Python execution environment
- Resource limits (CPU time, memory, filesystem)
- Output capture and structured result extraction
- Integration with agent executor for code-related tasks

### Phase 9 — Document Generation & Export (Planned)

- DOCX report generation from analysis results
- PPTX slide deck creation
- XLSX data export
- Template-based generation with LLM content filling
- Batch export capabilities

### Phase 10 — Multimodal Vision Integration (Planned)

- Direct image token support in agent pipeline
- Drawing, schematic, and photo understanding
- Visual question answering on technical diagrams
- Integration with document OCR for hybrid text+image analysis

### Phase 11 — Security Hardening (Planned)

- OS-level network monitoring (eBPF or socket interception)
- Runtime air-gap compliance proof generation
- File integrity monitoring
- Audit log tamper detection (hash chains)
- Input sanitization hardening

### Phase 12 — Authentication & Access Control (Planned)

- Role-based access control (RBAC)
- API key or token-based authentication
- Per-user knowledge base isolation
- Audit trail per user

### Phase 13 — Web Frontend (Planned)

- Browser-based UI for task submission
- Real-time execution trace visualization
- Document upload and management interface
- Knowledge base browsing and search UI
- RAG query interface with citation links

### Phase 14 — Deployment & Packaging (Planned)

- Docker containerization
- On-premise deployment scripts
- Air-gapped install package (all dependencies bundled)
- Configuration management for enterprise deployment
- Health monitoring and alerting

---

## Version History

| Version | Phase | Key Milestone |
|---------|-------|---------------|
| `0.1.0` | Foundation | FastAPI scaffold, model abstraction, security stubs, 25 tests |
| `0.3.0` | Agent Core | Deterministic agent pipeline, calculator, file reader, verifier, 123 tests |
| `0.4.0` | Document Intelligence | TXT/PDF/DOCX/OCR processors, document store, file APIs, 209 tests |
| `0.5.0` | Knowledge Base & RAG | Chunking, TF-IDF embeddings, vector store, ingestion, retrieval, RAG, 399 tests |
| `0.6.0` | RAG Hardening | Persistent storage, evidence quality, dedup, recovery, evaluation, **418 tests** |

---

*Generated: September 11, 2026*
*Branch: `feature/rag-hardening` @ commit `7a25c5e`*
