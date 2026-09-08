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

## Current Architecture (Foundation Phase)

```
User
  ↓
REST API (FastAPI)
  ↓
Agent Orchestrator
  ↓
Model Registry → Model Provider (abstract)
  ↓
DummyLocalModel (placeholder)
  ↓
Structured Response + Audit Record
```

### Key Components

| Module | Role |
|---|---|
| `backend/app/main.py` | FastAPI application entry point, lifecycle, route wiring |
| `backend/app/config.py` | Centralized settings via pydantic-settings |
| `backend/app/models/base.py` | Abstract `ModelProvider` interface |
| `backend/app/models/registry.py` | `ModelRegistry` — register and look up models by category |
| `backend/app/models/local.py` | `DummyLocalModel` — placeholder for testing |
| `backend/app/agents/orchestrator.py` | `AgentOrchestrator` — task → model → result pipeline |
| `backend/app/agents/planner.py` | `TaskPlanner` stub — future multi-step planning |
| `backend/app/agents/router.py` | `TaskRouter` stub — future task-to-model routing |
| `backend/app/api/agent.py` | `POST /agent/run` endpoint |
| `backend/app/api/models.py` | `GET /models/` endpoint |
| `backend/app/api/files.py` | Files API stub |
| `backend/app/security/audit.py` | `AuditService` — JSON-lines audit logging |
| `backend/app/security/network_monitor.py` | Network monitor stub |
| `backend/app/tools/` | Tool stubs (file, OCR, RAG, code, document) |
| `backend/app/knowledge/` | Knowledge ingestion and retrieval stubs |

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

### Run Agent Task

```bash
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "Analyze an inspection report"}'
```

## Current Limitations

This is the **foundation phase**. The following are **intentionally not implemented yet**:

- Real open-weight model integration (Ollama, vLLM, llama.cpp)
- Multi-step agentic reasoning and planning
- Intelligent task-to-model routing
- File upload and management
- OCR processing
- RAG / document search
- Sandboxed code execution
- Document generation (DOCX, PPTX, XLSX)
- Knowledge base ingestion
- Network monitoring / air-gap verification
- Authentication and authorization
- Frontend UI
- Docker deployment
- Database-backed audit trails

## Future Phases

1. **Model Integration** — Connect real open-weight models via Ollama/vLLM
2. **Tool Implementation** — File I/O, OCR, code execution, document generation
3. **RAG Pipeline** — Document ingestion, embedding, semantic retrieval
4. **Agentic Planning** — Multi-step task decomposition and execution
5. **Multimodal Support** — Image/drawing understanding via vision models
6. **Security Hardening** — Network monitoring, air-gap proof, auth
7. **Frontend** — Web UI for task submission and result viewing
8. **Deployment** — Docker, on-premise packaging, air-gapped install

## License

TBD
