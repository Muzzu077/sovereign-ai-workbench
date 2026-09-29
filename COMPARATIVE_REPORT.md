# Sovereign AI Workbench — Full Comparative Report

**MUZZU** (repo: `Muzzu077/sovereign-ai-workbench`)
**HARISH** (repo: `HARISHPG21/sovereign-ai-workbench`)

---

## 1. CODEBASE SCALE

| Metric | MUZZU | HARISH | Winner |
|--------|-------|--------|--------|
| Backend Python lines | ~9,700 (58 files) | ~3,500 (30 files) | MUZZU |
| Frontend TS/TSX lines | ~7,600 (43 files) | ~2,100 (10 files) | MUZZU |
| Test lines | ~6,600 (8 files, 565 tests) | ~200 (1 file, 7 tests) | MUZZU |
| Total codebase | ~24,350 lines | ~5,800 lines | MUZZU |
| Test-to-source ratio | 0.68:1 | 0.04:1 | MUZZU |

**Verdict:** MUZZU's codebase is ~4x larger with genuine depth across every subsystem. HARISH's codebase is leaner, with more demo/stub content relative to real logic.

---

## 2. RAG / KNOWLEDGE PIPELINE (Critical Differentiator)

| Aspect | MUZZU | HARISH |
|--------|-------|--------|
| **Embedding approach** | Dual: TF-IDF (sklearn) + Neural ONNX (all-MiniLM-L6-v2, 384-dim) | None. Substring `.count()` keyword matching |
| **Vector storage** | NumPy `.npz` with generation-based persistence, atomic writes, corruption detection (780 lines) | No vector storage. Raw text chunks in SQLite only |
| **Retrieval** | Cosine similarity over real embeddings, top-K with threshold filtering | `text.count(keyword)` scoring — not BM25, not semantic |
| **Evidence quality** | Classified as high/medium/low/insufficient based on score distribution | Not classified |
| **Chunking** | Paragraph-sentence-hard-split with overlap, section detection, SHA-256 chunk IDs (267 lines) | Basic text splitting stored in DB |
| **Citations** | Scored, location-deduplicated citations with document provenance | Hardcoded static SOP-08 citation when DB is empty |
| **RAG service** | Full retrieve-classify-prompt-generate-cite pipeline with grounding rules (242 lines) | No RAG service — retriever returns keyword matches directly |
| **Evaluation framework** | 612-line framework with synthetic industrial corpus, recall/precision metrics | None |
| **Persistent store** | 780-line generation-based NumPy store with checksum validation | None |
| **Total RAG lines** | 4,087 across 14 modules | ~65 in one file |
| **README claim vs reality** | Claims match implementation | Claims "Hybrid BM25 + Semantic Embeddings" — **not true**; it's substring counting |

**Winner: MUZZU by a wide margin.** This is the single biggest quality gap between the two projects. MUZZU has a real, functional RAG pipeline. HARISH has keyword substring matching labeled as "hybrid semantic search."

---

## 3. AGENT ORCHESTRATION

| Aspect | MUZZU | HARISH |
|--------|-------|--------|
| **Architecture** | 6 separate modules (orchestrator, router, planner, executor, verifier, trace) — 1,244 lines | 1 monolithic orchestrator.py (~280 lines) with all logic inlined |
| **Pipeline** | Task -> Route -> Plan -> Execute -> Verify -> Generate -> Audit | Task -> Route -> (Hardcoded plan) -> Agent steps -> Verify (string match) |
| **Planning** | Real deterministic planner that generates tool invocation plans based on route type (197 lines) | Hardcoded `thought_trace` string — not dynamic planning |
| **Execution** | Sequential tool executor with per-step verification (243 lines) | Tools called directly from orchestrator; `asyncio.sleep(0.3)` for UI delays |
| **Verification** | VerifierRegistry with pluggable verifiers (e.g., CalculatorVerifier re-computes arithmetic) | String containment check (`"3.18" in str(data)`) |
| **Tracing** | EventType enum with 10 event types, structured trace recording (99 lines) | AgentStep DB rows — functional but less structured |
| **Security** | LLM never sees tool-calling capability; app controls all tool execution | LLM generates code that gets executed — indirect tool calling via sandbox |
| **Fallback** | Model registry `get_available()` with automatic fallback to DummyLocalModel | Ollama -> hardcoded template engine |
| **Retry** | Bounded retry on verification failure | Bounded retry on citation check (similar) |

**Winner: MUZZU** for modularity, separation of concerns, and security design. HARISH has a working pipeline but it's monolithic with hardcoded plans and fragile verification.

**HARISH edge:** The multi-agent feedback loop (verification -> re-synthesis) is conceptually strong, and HARISH's orchestrator generates real `.docx/.pptx/.xlsx` deliverables, which MUZZU doesn't do.

---

## 4. MODEL PROVIDERS

| Aspect | MUZZU | HARISH |
|--------|-------|--------|
| **LLM runtime** | llama.cpp via `/v1/chat/completions` (OpenAI-compat) | Ollama via `/api/generate` (Ollama-native) |
| **Default model** | Gemma 3 4B IT Q4_K_M (1 model) | 8 models: Qwen2.5-VL-7B, Qwen2.5-Coder-7B, DeepSeek-R1-7B, Llama3.2-3B, Gemma2-9B, StarCoder2-15B, Mistral-NeMo-12B, Phi-3.5-3.8B |
| **Multimodal** | `ImageInput` in GenerationRequest (schema ready, no provider) | Qwen2.5-VL via Ollama with `images_base64` parameter |
| **Fallback model** | DummyLocalModel — 201 lines, 5 response modes, context-aware | Hardcoded if/elif template engine in `local_client.py` |
| **Provider abstraction** | Clean ABC (`ModelProvider`) with registry + `get_available()` fallback (4 files, 643 lines) | No abstraction — single Ollama client + fallback function |
| **Endpoint validation** | Refuses non-loopback URLs at construction time | No endpoint validation |
| **Health checks** | 4-state: available/unavailable/timeout/misconfigured | Connection check only (success/fail) |
| **Model catalog** | Registered at runtime in `main.py` | 8-model seed catalog with VRAM estimates and license annotations |

**Mixed verdict:**
- MUZZU has better **architecture** (ABC, registry, health states, endpoint validation)
- HARISH has better **model diversity** (8 models across 4 capabilities: vision, code, reasoning, fast)
- HARISH has actual **multimodal support** via Ollama's vision models
- MUZZU's endpoint validation (loopback-only) is a genuine security feature that HARISH lacks

---

## 5. TOOL SYSTEM

| Aspect | MUZZU | HARISH |
|--------|-------|--------|
| **Architecture** | ABC-based `Tool` with JSON Schema inputs, `ToolResult` output | Dict-based dispatch in registry, returns raw dicts |
| **Calculator** | AST-safe evaluation — never calls `eval()`/`exec()`, max exponent guard (155 lines) | No calculator tool |
| **File reader** | Sandboxed with path traversal prevention (217 lines) | Read/write/CSV/Excel edit — real implementations with path guards |
| **Code sandbox** | No sandbox implemented | `subprocess.Popen` with timeout + proxy env vars (partial isolation) |
| **RAG tool** | Wraps real cosine similarity retriever (83 lines) | Wraps keyword `.count()` retriever |
| **OCR** | Tesseract OCR integration (in requirements) | pypdf text extraction + hardcoded fallbacks for images |
| **Document gen** | Not implemented | Real `.docx`, `.pptx`, `.xlsx` generators using python-docx/pptx/openpyxl |
| **Prompt sanitization** | Not implemented | Regex-based injection detection (basic) |
| **Tool count** | 7 tools (4 are stubs, 3 real) | 11 tools (all functional at some level) |

**Mixed verdict:**
- MUZZU has better **security design** (AST calculator, no eval, sandboxed file reader)
- HARISH has more **functional tools** and real document generation
- HARISH's sandbox is weak but exists; MUZZU has no code execution sandbox
- HARISH's prompt injection defense is basic but exists; MUZZU has none

---

## 6. FRONTEND

| Aspect | MUZZU | HARISH |
|--------|-------|--------|
| **Framework** | Next.js 16.3.5 (latest) | Next.js 14.2.4 |
| **React** | 19.2.8 | 18.3.1 |
| **Pages** | 6 (Dashboard, Chat, Agent, Documents, Knowledge, Models) | 3 full pages (Workbench, Knowledge, Models) + 5 nav links to backend APIs |
| **Component library** | 12 "Sovereign" components + 12 UI primitives | All inline — no reusable component system |
| **Layout** | Sidebar + Topbar + CommandPalette | Single Navbar |
| **API client** | 205-line typed client with separate types file (387 lines) | 140-line client with hardcoded credentials |
| **Chat page** | 678-line Chat Studio with personas, multi-turn | Does not exist |
| **Agent page** | 387-line operations interface | Does not exist (all on the main workbench page) |
| **Documents page** | 443-line document management | Does not exist |
| **Theme** | CSS custom properties (extendable) | ~450 lines of `!important` overrides (fragile) |
| **Accessibility** | Minimal — no aria labels on modals | Partial — `aria-label` on hamburger/theme toggle, but no focus traps |
| **Animations** | framer-motion used throughout | Custom CSS animations (laser-scan, button-shimmer, step-pulse) |
| **Total lines** | ~7,600 | ~2,100 |

**HARISH edge:**
- **P&ID Overlay Viewer** (280 lines) — SVG blueprint with interactive bounding boxes, laser-scan animation, 3 view modes. This is a genuinely impressive domain-specific visualization that MUZZU does not have.
- **DAG execution timeline** — real-time step-by-step visualization with agent/model/tool/thought-trace per step.
- **Demo launcher** — 3 pre-built demo scenarios that self-execute with synthetic data.

**MUZZU edge:**
- **Chat Studio** (678 lines) — full conversational interface that HARISH entirely lacks
- **Component reuse** — modular Sovereign component library vs everything inline
- **6 routes vs 3** — broader functional coverage
- **Typed API layer** — separate types file, no hardcoded credentials

**Winner: MUZZU** for breadth, architecture, and engineering quality. **HARISH** for domain-specific visual impact (P&ID viewer, DAG timeline, demo scenarios).

---

## 7. TESTING

| Metric | MUZZU | HARISH |
|--------|-------|--------|
| **Test files** | 8 | 1 (+3 standalone scripts) |
| **Test count** | 565 | 7 |
| **Test lines** | 6,600 | ~200 |
| **Subsystems tested** | Foundation, Agent, Documents, RAG, Provider, Neural Embeddings, RAG Hardening | Health endpoint, router, sandbox, generators, security, file I/O, injection |
| **Real code tested?** | Yes — exercises real chunking, TF-IDF, cosine similarity, FastAPI endpoints, SQLite persistence | Yes — exercises real generators, subprocess, psutil |
| **LLM tested?** | Structurally (mocked) | Not tested |
| **Frontend tests** | None | None |
| **CI/CD** | None | None |

**Winner: MUZZU decisively.** 565 tests with a 0.68 test-to-source ratio vs 7 tests with a 0.04 ratio. Both lack frontend tests and CI/CD.

---

## 8. SECURITY & AIR-GAP COMPLIANCE

| Aspect | MUZZU | HARISH |
|--------|-------|--------|
| **Audit logging** | JSON-lines append-only file (honestly labeled as not tamper-evident) | SQLAlchemy AuditLog DB model |
| **Network monitoring** | Config-level URL validation (checks loopback) | psutil OS-level socket inspection (checks actual connections) |
| **Endpoint enforcement** | LlamaCppProvider refuses non-loopback URLs | No enforcement — Ollama URL trusts config |
| **Calculator safety** | AST-walking, no eval()/exec() | No calculator |
| **CORS** | Configurable allowed origins | `allow_origins=["*"]` (contradicts air-gap claim) |
| **Authentication** | None | JWT + bcrypt password hashing (5 demo users with hardcoded passwords) |
| **Path traversal protection** | FileReaderTool sandboxing | File I/O tool with path guards |
| **Prompt injection defense** | None | Regex-based sanitizer (basic) |
| **Secret management** | Env vars via pydantic-settings | Hardcoded `SECRET_KEY` and passwords in source |
| **Deliverables download** | N/A | **Path traversal vulnerability** — no filename sanitization |

**Mixed verdict:**
- HARISH has **auth** (JWT + bcrypt) and **real OS-level network monitoring** (psutil socket scan) — both genuinely valuable
- MUZZU has **better preventive security** — endpoint enforcement, AST calculator, no hardcoded secrets
- HARISH has critical issues: `allow_origins=["*"]` CORS, hardcoded passwords, path traversal in deliverables endpoint
- Both lack proper file-integrity or tamper-evident audit trails

---

## 9. DEVOPS & DEPLOYMENT

| Aspect | MUZZU | HARISH |
|--------|-------|--------|
| **Docker** | `docker/` exists but is gitignored (empty) | Dockerfiles for backend (python:3.11-slim) + frontend (node:20-alpine) + docker-compose.yml |
| **CI/CD** | None | None |
| **Diagnostics** | `scripts/diagnostics.py` (207 lines) | Health check endpoint only |
| **Smoke test** | `scripts/smoke_test.py` (243 lines) | None |
| **Database** | File-based (NumPy, JSON, SQLite) | SQLAlchemy (SQLite/Postgres) |

**Winner: HARISH** for having working Docker configs and a proper database layer. MUZZU's Docker directory is empty. Both lack CI/CD.

---

## 10. UNIQUE FEATURES EACH PROJECT HAS

### HARISH has (MUZZU doesn't):
1. **JWT Authentication** with role-based access (5 roles: admin, engineer, manager, analyst, developer)
2. **Real document generation** — `.docx`, `.pptx`, `.xlsx` with domain-specific formatting
3. **Code execution sandbox** (subprocess with timeout)
4. **P&ID SVG overlay viewer** with interactive bounding boxes
5. **psutil OS-level socket monitoring** (real external connection detection)
6. **Multi-model catalog** (8 models across 4 capabilities)
7. **WebSocket real-time step streaming**
8. **Prompt injection defense** (regex-based)
9. **Docker configs** (backend + frontend + Ollama compose)
10. **SAP/SCADA/DMS integration stubs** (future-ready)
11. **Demo launcher** with 3 pre-built scenarios
12. **MRPL domain specificity** — SOP-08, ISO 10816, HAZOP, P&ID references throughout

### MUZZU has (HARISH doesn't):
1. **Real RAG pipeline** — TF-IDF + neural embeddings, vector storage, cosine similarity (4,087 lines vs 65)
2. **Chat interface** (678-line Chat Studio with personas)
3. **565 tests** vs 7 tests
4. **Modular agent pipeline** (6 separate files vs 1 monolith)
5. **ABC-based provider abstraction** with registry and fallback
6. **AST-safe calculator** (security-first design)
7. **Neural embedding support** (ONNX all-MiniLM-L6-v2)
8. **Evaluation framework** for RAG quality metrics
9. **Generation-based persistent vector store** with corruption detection (780 lines)
10. **Reusable component library** (12 Sovereign components)
11. **CommandPalette** (keyboard-driven navigation)
12. **Endpoint enforcement** (refuses non-loopback LLM URLs)

---

## 11. HONEST ASSESSMENT: CLAIMS vs REALITY

| Claim (both READMEs) | MUZZU Reality | HARISH Reality |
|-----------------------|---------------|----------------|
| "Hybrid BM25 + Semantic Embeddings" | **TRUE** — TF-IDF + Neural ONNX | **FALSE** — substring `.count()` keyword matching |
| "Air-gapped / zero-egress" | Partial — config-level URL validation | Partial — psutil scan + proxy env vars |
| "Sandboxed code execution" | **NOT IMPLEMENTED** | **PARTIAL** — subprocess with timeout, no real isolation |
| "Tesseract OCR" | In requirements.txt (real) | **NOT PRESENT** — no pytesseract, hardcoded fallbacks |
| "100% Present features" | Not claimed | **OVERSTATED** — RAG is stub, OCR for images is demo |
| "565 tests / 7 tests" | **TRUE** — all pass | **TRUE** — all pass (narrow scope) |

---

## 12. OVERALL VERDICT

### Who did better overall?

**MUZZU is the stronger project** in terms of engineering depth, code quality, testing rigor, and honest implementation of the core AI features (RAG, agent pipeline, model abstraction). The 4,087-line RAG pipeline with real embeddings and the 565-test suite are the most significant differentiators.

**HARISH is stronger** in demo polish, domain specificity (MRPL/refinery), deliverable generation, authentication, Docker deployment, visual impact (P&ID viewer, DAG timeline). For a hackathon judging scenario, HARISH's demo workflow is more impressive to watch even though the underlying AI is demo responses.

### Scores by dimension (1-10):

| Dimension | MUZZU | HARISH |
|-----------|-------|--------|
| RAG/Knowledge pipeline | **9** | 2 |
| Agent architecture | **8** | 5 |
| Testing | **9** | 2 |
| Security design | **7** | 5 |
| Model provider abstraction | **8** | 4 |
| Frontend breadth | **8** | 5 |
| Frontend visual polish | 7 | **8** |
| Document generation | 0 | **8** |
| Authentication | 0 | **7** |
| Code sandbox | 0 | **5** |
| Docker/DevOps | 1 | **6** |
| Domain specificity | 4 | **9** |
| Demo impact | 5 | **8** |
| Honesty of claims | **9** | 4 |
| **Average** | **5.4** | **5.6** |

The averages are close because HARISH wins in areas MUZZU hasn't implemented at all (auth, document gen, sandbox, Docker), while MUZZU wins decisively in the core AI/ML areas.

---

## 13. WHAT BOTH STILL NEED TO IMPROVE

### Both need:
1. **CI/CD pipeline** — GitHub Actions for pytest + frontend build + linting
2. **Frontend tests** — Zero test coverage on frontend for both
3. **React error boundaries** — Neither project handles component crashes gracefully
4. **Accessibility** — Both are weak on ARIA, focus management, keyboard navigation
5. **Local fonts** — Both load from Google Fonts (breaks in true air-gap)
6. **Rate limiting** — Neither has API rate limiting
7. **Proper secrets management** — Neither uses a vault; HARISH has hardcoded passwords

### MUZZU specifically needs:
1. **Authentication** — No auth layer at all
2. **Document generation** — No `.docx`/`.pptx`/`.xlsx` output capability
3. **Code execution sandbox** — No way to run user code safely
4. **Docker configs** — Empty docker directory
5. **WebSocket streaming** — No real-time step updates
6. **Database** — File-based storage won't scale; needs SQLAlchemy/SQLite at minimum
7. **Multi-model support** — Only 1 model (Gemma 3 4B); needs vision, code, reasoning models
8. **Prompt injection defense** — No sanitization layer
9. **Domain-specific features** — Lacks MRPL/refinery-specific content for SIH judging

### HARISH specifically needs:
1. **Real RAG pipeline** — Replace substring counting with actual embeddings + vector search. This is the biggest gap. Add `sentence-transformers` or use ONNX embeddings like MUZZU does.
2. **Real tests** — 7 tests is insufficient. Need comprehensive subsystem tests.
3. **Fix CORS** — `allow_origins=["*"]` contradicts the air-gap claim
4. **Fix path traversal** — Deliverables endpoint has no filename sanitization
5. **Remove hardcoded credentials** — Demo passwords in source code
6. **Modularize orchestrator** — Split the 280-line monolith into separate router/planner/executor/verifier modules
7. **Chat interface** — No conversational UI exists
8. **Provider abstraction** — No ABC/interface for model providers
9. **Fix README claims** — "Hybrid BM25 + Semantic" is inaccurate; fix or implement
10. **Add endpoint validation** — Ollama URL should be validated as loopback-only
