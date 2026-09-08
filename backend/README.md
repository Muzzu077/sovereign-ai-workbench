# Backend — Sovereign AI Workbench

FastAPI backend for the Sovereign AI Workbench.

## Quick Start

```bash
# From the repository root
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Run the server
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Project Structure

```
app/
├── main.py              # Application entry point
├── config.py            # Settings (env-driven)
├── agents/              # Orchestrator, planner, router
├── models/              # Model abstraction, registry, providers
├── tools/               # Tool implementations (stubs)
├── knowledge/           # RAG ingestion & retrieval (stubs)
├── security/            # Audit logging, network monitoring
└── api/                 # FastAPI route modules
```

See the root [README.md](../README.md) for full documentation.
