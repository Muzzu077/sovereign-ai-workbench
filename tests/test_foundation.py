"""
Tests for the Sovereign AI Workbench foundation.

Covers:
- Root and health endpoints
- Model registry
- Dummy model provider
- Agent orchestrator
- POST /agent/run API
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.registry import ModelRegistry
from app.models.local import DummyLocalModel
from app.models.base import GenerationRequest
from app.security.audit import AuditService
from app.agents.orchestrator import AgentOrchestrator


# ------------------------------------------------------------------ fixtures


@pytest.fixture()
def client() -> TestClient:
    """Create a test client with the full FastAPI app."""
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def registry() -> ModelRegistry:
    """Fresh model registry."""
    return ModelRegistry()


@pytest.fixture()
def dummy_model() -> DummyLocalModel:
    """Dummy model instance."""
    return DummyLocalModel()


@pytest.fixture()
def audit_service(tmp_path) -> AuditService:
    """Audit service writing to a temporary file."""
    return AuditService(log_file=tmp_path / "test_audit.log")


@pytest.fixture()
def orchestrator(registry, dummy_model, audit_service) -> AgentOrchestrator:
    """Orchestrator wired to the dummy model."""
    registry.register("general", dummy_model)
    return AgentOrchestrator(
        registry=registry,
        audit_service=audit_service,
        default_model="general",
    )


# ------------------------------------------------------------ endpoint tests


class TestRootEndpoint:
    def test_root_returns_200(self, client: TestClient) -> None:
        response = client.get("/")
        assert response.status_code == 200

    def test_root_contains_service_name(self, client: TestClient) -> None:
        data = client.get("/").json()
        assert "Sovereign AI Workbench" in data["service"]

    def test_root_status_running(self, client: TestClient) -> None:
        data = client.get("/").json()
        assert data["status"] == "running"


class TestHealthEndpoint:
    def test_health_returns_200(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_status_healthy(self, client: TestClient) -> None:
        data = client.get("/health").json()
        assert data["status"] == "healthy"

    def test_health_has_timestamp(self, client: TestClient) -> None:
        data = client.get("/health").json()
        assert "timestamp" in data

    def test_health_lists_models(self, client: TestClient) -> None:
        data = client.get("/health").json()
        assert "general" in data["models_registered"]


# ---------------------------------------------------------- model registry tests


class TestModelRegistry:
    def test_register_and_get(self, registry, dummy_model) -> None:
        registry.register("general", dummy_model)
        assert registry.get("general") is dummy_model

    def test_duplicate_register_raises(self, registry, dummy_model) -> None:
        registry.register("general", dummy_model)
        with pytest.raises(ValueError, match="already registered"):
            registry.register("general", dummy_model)

    def test_get_missing_raises(self, registry) -> None:
        with pytest.raises(KeyError, match="No model provider"):
            registry.get("nonexistent")

    def test_list_models(self, registry, dummy_model) -> None:
        registry.register("a", dummy_model)
        registry.register("b", dummy_model)
        assert set(registry.list_models()) == {"a", "b"}

    def test_has(self, registry, dummy_model) -> None:
        assert not registry.has("general")
        registry.register("general", dummy_model)
        assert registry.has("general")

    def test_unregister(self, registry, dummy_model) -> None:
        registry.register("general", dummy_model)
        registry.unregister("general")
        assert not registry.has("general")


# ---------------------------------------------------------- dummy model tests


class TestDummyLocalModel:
    def test_get_name(self, dummy_model) -> None:
        assert dummy_model.get_name() == "dummy-local"

    def test_is_available(self, dummy_model) -> None:
        assert dummy_model.is_available() is True

    def test_generate_returns_response(self, dummy_model) -> None:
        request = GenerationRequest(prompt="Test task")
        response = dummy_model.generate(request)
        assert "Test task" in response.text
        assert response.model_name == "dummy-local"

    def test_capabilities(self, dummy_model) -> None:
        cap = dummy_model.get_capabilities()
        assert cap.supports_text is True
        assert cap.supports_vision is False


# ------------------------------------------------------ orchestrator tests


class TestAgentOrchestrator:
    def test_run_returns_success(self, orchestrator) -> None:
        result = orchestrator.run("Analyze a report")
        assert result.execution_status == "success"
        assert result.selected_model == "general"
        assert "Analyze a report" in result.result

    def test_run_missing_model_returns_error(self, audit_service) -> None:
        empty_registry = ModelRegistry()
        orch = AgentOrchestrator(
            registry=empty_registry,
            audit_service=audit_service,
            default_model="general",
        )
        result = orch.run("Some task")
        assert result.execution_status == "error"
        assert "Model selection failed" in result.result


# -------------------------------------------------------- agent API tests


class TestAgentRunAPI:
    def test_post_agent_run_success(self, client: TestClient) -> None:
        response = client.post("/agent/run", json={"task": "Analyze an inspection report"})
        assert response.status_code == 200
        data = response.json()
        assert data["task"] == "Analyze an inspection report"
        assert data["selected_model"] == "general"
        assert data["execution_status"] == "success"
        assert "provider" in data
        assert len(data["result"]) > 0

    def test_post_agent_run_empty_task(self, client: TestClient) -> None:
        response = client.post("/agent/run", json={"task": "   "})
        assert response.status_code == 422

    def test_post_agent_run_missing_body(self, client: TestClient) -> None:
        response = client.post("/agent/run")
        assert response.status_code == 422


# ------------------------------------------------------- audit service tests


class TestAuditService:
    def test_record_creates_entry(self, audit_service) -> None:
        record = audit_service.record(
            task="Test task",
            selected_model="general",
            execution_status="success",
        )
        assert record.task == "Test task"
        assert record.execution_status == "success"
        assert record.timestamp is not None

    def test_get_recent(self, audit_service) -> None:
        audit_service.record(task="task1", selected_model="m", execution_status="success")
        audit_service.record(task="task2", selected_model="m", execution_status="error")
        records = audit_service.get_recent()
        assert len(records) == 2
        assert records[0].task == "task1"
        assert records[1].task == "task2"

    def test_get_recent_empty(self, audit_service) -> None:
        assert audit_service.get_recent() == []
