# Sovereign AI Workbench

**SIH 2026 — Problem ID 26117**

Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work.

## Purpose

A self-hosted, air-gap-capable AI workbench that enables confidential industrial organizations to leverage open-weight multimodal LLMs for agentic task execution — without any data leaving the premises.

The system is designed to support:

- Multiple open-weight AI models with automatic task-based selection
- Agentic multi-step task execution with planning, tool use, and verification
- Local file reading (TXT, PDF, DOCX) with path traversal protection
- Safe arithmetic evaluation (AST-based, no eval/exec)
- Full execution traces and audit logging
- Deterministic task routing (no LLM in the control loop)
- Visible proof of air-gap compliance (no external network calls)

## Architecture (Agent Core)

```
User
  ↓
REST API  (FastAPI)
  ↓
AgentOrchestrator
  ├── TaskRouter       — deterministic keyword routing
  ├── TaskPlanner      — builds ExecutionPlan with PlanStep[]
  ├── AgentExecutor    — sequential step execution
  │     ├── ToolRegistry → CalculatorTool / FileReaderTool
  │     └── VerifierRegistry → CalculatorVerifier
  ├── ExecutionTrace   — structured event timeline
  └── ModelProvider    — Gemma 3 4B via llama.cpp (local only)
        ↓
  Structured Response + Audit Record
```

### Pipeline Flow

```
Task → Route → Plan → Execute Tools → Verify → LLM Response → Audit
```

1. **Route** — `TaskRouter` classifies the task (general / calculation / file_analysis / multi_step) using keyword patterns. No LLM involved.
2. **Plan** — `TaskPlanner` creates an `ExecutionPlan` with concrete `PlanStep` objects, each referencing a registered tool and its inputs. Cross-validates tool references against the `ToolRegistry`.
3. **Execute** — `AgentExecutor` runs steps sequentially, passes context between dependent steps (e.g., file contents → calculator), and collects `ToolResult` objects.
4. **Verify** — After each tool step, `VerifierRegistry` dispatches to an appropriate verifier (e.g., `CalculatorVerifier` re-evaluates the expression independently). Status: PASS / FAIL / NOT_VERIFIED.
5. **LLM** — The orchestrator builds a prompt that includes tool results and sends it to the model for a natural-language response. The model does NOT execute tools — the application controls all tool execution.
6. **Audit** — Every run is recorded with task type, tools used, verification summary, provider info, and execution trace.

### Key Components

| Module | Role |
|---|---|
| `backend/app/main.py` | FastAPI app, lifecycle, registry wiring |
| `backend/app/config.py` | Centralized settings (`SAW_` env prefix) |
| **Models** | |
| `backend/app/models/base.py` | `ModelProvider` ABC, `GenerationRequest`, `ImageInput` |
| `backend/app/models/registry.py` | `ModelRegistry` — register/lookup by category |
| `backend/app/models/local.py` | `DummyLocalModel` — offline placeholder |
| `backend/app/models/llama_cpp_provider.py` | `LlamaCppProvider` — real Gemma inference via llama.cpp |
| **Agent Core** | |
| `backend/app/agents/orchestrator.py` | `AgentOrchestrator` — coordinates the full pipeline |
| `backend/app/agents/router.py` | `TaskRouter` — deterministic keyword-based routing |
| `backend/app/agents/planner.py` | `TaskPlanner` — builds `ExecutionPlan` / `PlanStep` |
| `backend/app/agents/executor.py` | `AgentExecutor` — runs plan steps, passes context |
| `backend/app/agents/verifier.py` | `Verifier` ABC, `CalculatorVerifier`, `VerifierRegistry` |
| `backend/app/agents/trace.py` | `ExecutionTrace`, `TraceEvent`, `EventType` enum |
| **Tools** | |
| `backend/app/tools/base.py` | `Tool` ABC, `ToolInput`, `ToolResult` |
| `backend/app/tools/registry.py` | `ToolRegistry` — register/get/list tools |
| `backend/app/tools/calculator.py` | `CalculatorTool` — safe AST-based arithmetic |
| `backend/app/tools/file_reader.py` | `FileReaderTool` — TXT/PDF/DOCX, path traversal guard |
| **API** | |
| `backend/app/api/agent.py` | `POST /agent/run` — returns structured `AgentRunResponse` |
| `backend/app/api/models.py` | `GET /models/`, `GET /models/health` |
| **Security** | |
| `backend/app/security/audit.py` | `AuditService` — JSON-lines audit logging |

### Local LLM Integration

The workbench uses **Gemma 3 4B** (Q4_K_M quantization) running through **llama.cpp** with CUDA acceleration on the local GPU.

| Parameter | Value |
|---|---|
| Model | `gemma-3-4b-it-Q4_K_M.gguf` (2.4 GB) |
| Runtime | llama.cpp (CUDA build) |
| GPU | NVIDIA RTX 4050 (6141 MiB VRAM) |
| Performance | ~62 tok/s predicted, ~302 tok/s prompt |
| VRAM usage | ~3261 MiB |
| Context size | 8192 tokens |
| Endpoint | `http://127.0.0.1:8080` (local only) |

**Security**: `LlamaCppProvider` rejects any non-loopback URL (only localhost / 127.0.0.1 / [::1] / 0.0.0.0 accepted). Provider type is immutable after init.

## Getting Started

### Prerequisites

- Python 3.11+
- NVIDIA GPU with CUDA (for llama.cpp acceleration)
- llama.cpp built with CUDA support

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd sovereign-ai-workbench

# Install dependencies
pip install -r backend/requirements.txt

# Download the model
mkdir -p models
# Place gemma-3-4b-it-Q4_K_M.gguf in models/
```

### Start llama.cpp Server

```bash
./llama.cpp/build/bin/llama-server \
  --model models/gemma-3-4b-it-Q4_K_M.gguf \
  --host 127.0.0.1 --port 8080 \
  --n-gpu-layers 99 --ctx-size 8192
```

### Run the Backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.

- Root: `GET /`
- Health: `GET /health` (includes `tools_registered` list)
- Run agent: `POST /agent/run`
- Model health: `GET /models/health`
- API docs: `GET /docs`

### Run Tests

From the project root:

```bash
pytest       # all 193 tests
pytest -v    # verbose output
```

Tests use `SAW_LLM_ENABLED=false` (set in `tests/conftest.py`) so they do not require a running llama.cpp server.

## API Examples

### Health Check

```bash
curl http://localhost:8000/health
```

### Run a Calculation

```bash
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "calculate 125 * 37"}'
```

Response includes `run_id`, `task_type`, `plan`, `tool_calls` (with verification status), `result`, `provider`, and `execution_status`.

### Read a File and Calculate

```bash
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "read data.txt and calculate the average"}'
```

### General Question

```bash
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "explain quantum computing"}'
```

## Test Coverage

| Test File | Tests | Scope |
|---|---|---|
| `tests/test_foundation.py` | 25 | Root/health API, registry, dummy model, orchestrator, audit |
| `tests/test_llama_cpp_provider.py` | 70 | LlamaCpp init, local enforcement, generation, health status, multimodal readiness, security |
| `tests/test_agent_core.py` | 98 | Tool abstraction, registry, calculator (12 ops + 12 safety), file reader (TXT/PDF/DOCX + 5 traversal), router, planner, executor, verifier, trace, orchestrator pipeline, API response, audit integration |
| **Total** | **193** | |

## Security Properties

- **Local-only LLM**: Provider rejects non-loopback URLs at construction time
- **No eval/exec**: Calculator uses AST-based evaluation with allowlisted node types
- **Path traversal protection**: FileReaderTool resolves paths and rejects anything outside `workspace_root`
- **Model cannot execute tools**: The application controls all tool execution; the model only receives results
- **Exponent guard**: Rejects exponents > 10,000 to prevent resource exhaustion
- **Immutable provider config**: Base URL and provider type cannot be changed after init

## Current Limitations

The following are **intentionally not implemented yet**:

- Multimodal image inference (no mmproj model file)
- OCR processing
- RAG / document search / embeddings / vector DB
- Sandboxed code execution
- Document generation (DOCX, PPTX, XLSX)
- Knowledge base ingestion
- Network monitoring / air-gap verification
- Authentication and authorization
- Frontend UI
- Docker deployment
- Database-backed audit trails

## Completed Phases

1. **Foundation** — FastAPI scaffold, model registry, dummy model, audit, 25 tests
2. **LLM Integration** — Gemma 3 4B via llama.cpp with CUDA, health status, local-only enforcement, multimodal readiness, 70 tests
3. **Agent Core** — Tool abstraction, CalculatorTool, FileReaderTool, TaskRouter, TaskPlanner, AgentExecutor, Verifier, ExecutionTrace, refactored Orchestrator, upgraded API, 98 tests

## Future Phases

4. **RAG Pipeline** — Document ingestion, embedding, semantic retrieval
5. **Multimodal Support** — Image/drawing understanding via vision models
6. **Security Hardening** — Network monitoring, air-gap proof, auth
7. **Frontend** — Web UI for task submission and result viewing
8. **Deployment** — Docker, on-premise packaging, air-gapped install

## License

TBD
