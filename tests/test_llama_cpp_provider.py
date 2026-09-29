"""
Tests for the LlamaCpp local model provider integration.

Covers:
- Provider initialization and configuration
- Local endpoint validation (reject non-local URLs)
- Successful generation via mocked HTTP server
- Server unavailable handling
- Timeout handling
- Registry registration with real provider
- Agent orchestrator using real provider
- Models health endpoint
- No cloud fallback
- Audit records include provider information

All tests use mocked HTTP responses and do NOT require a real
llama.cpp server or model download.
"""

import json
from unittest.mock import patch, MagicMock

import pytest
import httpx

from app.models.llama_cpp_provider import (
    LlamaCppProvider,
    LocalEndpointError,
    LlamaCppProviderError,
    validate_local_endpoint,
)
from app.models.base import GenerationRequest
from app.models.registry import ModelRegistry
from app.security.audit import AuditService
from app.agents.orchestrator import AgentOrchestrator


# --------------------------------------------------------------- helpers

def _mock_chat_response(text: str = "Hello from llama.cpp", total_tokens: int = 42):
    """Build a mock OpenAI-compatible chat completion response."""
    return {
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 32,
            "total_tokens": total_tokens,
        },
    }


# ------------------------------------------ provider initialization tests


class TestLlamaCppProviderInit:
    def test_init_with_localhost(self) -> None:
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            model_id="test-model",
            timeout=60,
        )
        assert provider.get_name() == "llama-cpp:test-model"

    def test_init_with_localhost_hostname(self) -> None:
        provider = LlamaCppProvider(base_url="http://localhost:8080")
        assert provider.get_base_url() == "http://localhost:8080"

    def test_init_with_ipv6_loopback(self) -> None:
        provider = LlamaCppProvider(base_url="http://[::1]:8080")
        assert provider.get_base_url() == "http://[::1]:8080"

    def test_get_provider_type(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        assert provider.get_provider_type() == "llama_cpp"

    def test_get_capabilities(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        cap = provider.get_capabilities()
        assert cap.supports_text is True
        assert cap.supports_code is True


# ------------------------------------------ endpoint validation tests


class TestLocalEndpointValidation:
    def test_reject_external_host(self) -> None:
        with pytest.raises(LocalEndpointError, match="not a local address"):
            validate_local_endpoint("http://api.openai.com/v1")

    def test_reject_external_ip(self) -> None:
        with pytest.raises(LocalEndpointError, match="not a local address"):
            validate_local_endpoint("http://192.168.1.100:8080")

    def test_reject_cloud_provider(self) -> None:
        with pytest.raises(LocalEndpointError, match="not a local address"):
            validate_local_endpoint("https://api.anthropic.com/v1")

    def test_reject_random_domain(self) -> None:
        with pytest.raises(LocalEndpointError, match="not a local address"):
            validate_local_endpoint("http://some-server.example.com:8080")

    def test_accept_127_0_0_1(self) -> None:
        validate_local_endpoint("http://127.0.0.1:8080")  # no exception

    def test_accept_localhost(self) -> None:
        validate_local_endpoint("http://localhost:8080")  # no exception

    def test_accept_ipv6_loopback(self) -> None:
        validate_local_endpoint("http://[::1]:8080")  # no exception

    def test_provider_rejects_external_on_init(self) -> None:
        with pytest.raises(LocalEndpointError):
            LlamaCppProvider(base_url="http://cloud-llm.example.com:8080")

    def test_no_cloud_fallback_in_provider(self) -> None:
        """Ensure there is no mechanism that silently switches to a cloud URL."""
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        # The base URL must remain exactly what was configured
        assert provider.get_base_url() == "http://127.0.0.1:8080"


# ---------------------------------------------- generation (mocked) tests


class TestLlamaCppGeneration:
    def test_successful_generation(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        request = GenerationRequest(prompt="What is 2+2?")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _mock_chat_response("4", 15)

        with patch.object(httpx, "post", return_value=mock_resp):
            response = provider.generate(request)

        assert response.text == "4"
        assert response.model_name == "llama-cpp:gemma-3-4b-it"
        assert response.tokens_used == 15
        assert response.metadata["provider"] == "llama_cpp"
        assert response.metadata["local"] is True

    def test_generation_with_system_prompt(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        request = GenerationRequest(
            prompt="Explain AI",
            system_prompt="You are a helpful assistant.",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _mock_chat_response("AI is...")

        with patch.object(httpx, "post", return_value=mock_resp) as mock_post:
            provider.generate(request)

        # Verify system prompt was included in the messages
        call_kwargs = mock_post.call_args
        payload = call_kwargs.kwargs["json"] if "json" in call_kwargs.kwargs else call_kwargs[1]["json"]
        messages = payload["messages"]
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"


# ----------------------------------------- server unavailable tests


class TestLlamaCppUnavailable:
    def test_is_available_when_server_down(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        with patch.object(httpx, "get", side_effect=httpx.ConnectError("refused")):
            assert provider.is_available() is False

    def test_is_available_when_server_up(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        with patch.object(httpx, "get", return_value=mock_resp):
            assert provider.is_available() is True

    def test_is_available_on_timeout(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        with patch.object(httpx, "get", side_effect=httpx.TimeoutException("timeout")):
            assert provider.is_available() is False

    def test_generate_raises_on_connect_error(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        request = GenerationRequest(prompt="test")
        with patch.object(httpx, "post", side_effect=httpx.ConnectError("refused")):
            with pytest.raises(LlamaCppProviderError, match="Cannot connect"):
                provider.generate(request)

    def test_generate_raises_on_http_error(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        request = GenerationRequest(prompt="test")
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"
        with patch.object(httpx, "post", return_value=mock_resp):
            with pytest.raises(LlamaCppProviderError, match="HTTP 500"):
                provider.generate(request)


# ------------------------------------------------- timeout tests


class TestLlamaCppTimeout:
    def test_generate_raises_on_timeout(self) -> None:
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            timeout=10,
        )
        request = GenerationRequest(prompt="slow task")
        with patch.object(httpx, "post", side_effect=httpx.TimeoutException("timed out")):
            with pytest.raises(LlamaCppProviderError, match="timed out"):
                provider.generate(request)

    def test_timeout_value_passed_to_httpx(self) -> None:
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            timeout=45,
        )
        request = GenerationRequest(prompt="test")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _mock_chat_response("ok")

        with patch.object(httpx, "post", return_value=mock_resp) as mock_post:
            provider.generate(request)

        call_kwargs = mock_post.call_args
        timeout_val = call_kwargs.kwargs.get("timeout") or call_kwargs[1].get("timeout")
        assert timeout_val == 45.0


# --------------------------------------- registry with real provider tests


class TestRegistryWithLlamaCpp:
    def test_register_llama_cpp_provider(self) -> None:
        registry = ModelRegistry()
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        registry.register("general", provider)
        assert registry.has("general")
        assert registry.get("general") is provider

    def test_registry_multiple_categories(self) -> None:
        registry = ModelRegistry()
        general = LlamaCppProvider(
            base_url="http://127.0.0.1:8080", model_id="general-model"
        )
        coding = LlamaCppProvider(
            base_url="http://127.0.0.1:8080", model_id="coding-model"
        )
        registry.register("general", general)
        registry.register("coding", coding)
        assert set(registry.list_models()) == {"general", "coding"}


# ------------------------------- orchestrator with real provider tests


class TestOrchestratorWithLlamaCpp:
    def test_orchestrator_uses_llama_cpp(self, tmp_path) -> None:
        registry = ModelRegistry()
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        registry.register("general", provider)
        audit = AuditService(log_file=tmp_path / "test_audit.log")
        orch = AgentOrchestrator(registry=registry, audit_service=audit)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _mock_chat_response("Analysis complete", 50)

        # Mock is_available to True and generate call
        with patch.object(httpx, "get") as mock_get, \
             patch.object(httpx, "post", return_value=mock_resp):
            mock_health = MagicMock()
            mock_health.status_code = 200
            mock_get.return_value = mock_health

            result = orch.run("Analyze the document")

        assert result.execution_status == "success"
        assert result.provider == "llama_cpp"
        assert "Analysis complete" in result.result

    def test_orchestrator_handles_unavailable_server(self, tmp_path) -> None:
        registry = ModelRegistry()
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        registry.register("general", provider)
        audit = AuditService(log_file=tmp_path / "test_audit.log")
        orch = AgentOrchestrator(registry=registry, audit_service=audit)

        with patch.object(httpx, "get", side_effect=httpx.ConnectError("refused")):
            result = orch.run("Some task")

        assert result.execution_status == "error"
        assert "not currently available" in result.result

    def test_orchestrator_handles_generation_error(self, tmp_path) -> None:
        registry = ModelRegistry()
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        registry.register("general", provider)
        audit = AuditService(log_file=tmp_path / "test_audit.log")
        orch = AgentOrchestrator(registry=registry, audit_service=audit)

        mock_health = MagicMock()
        mock_health.status_code = 200

        with patch.object(httpx, "get", return_value=mock_health), \
             patch.object(httpx, "post", side_effect=httpx.ConnectError("refused")):
            result = orch.run("Some task")

        assert result.execution_status == "error"
        assert "Execution failed" in result.result


# --------------------------------------------- models health API tests


class TestModelsHealthAPI:
    @pytest.fixture()
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_models_health_endpoint_exists(self, client) -> None:
        response = client.get("/models/health")
        assert response.status_code == 200

    def test_models_health_returns_general(self, client) -> None:
        data = client.get("/models/health").json()
        assert "models" in data
        assert len(data["models"]) >= 1
        model = data["models"][0]
        assert model["name"] == "general"
        assert model["local"] is True
        assert model["status"] in ("available", "unavailable", "timeout", "misconfigured")

    def test_models_list_includes_provider_type(self, client) -> None:
        data = client.get("/models/").json()
        model = data["models"]["general"]
        assert "provider_type" in model
        assert model["local"] is True


# --------------------------------------- audit with provider info tests


class TestAuditWithProviderInfo:
    def test_audit_records_provider(self, tmp_path) -> None:
        registry = ModelRegistry()
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        registry.register("general", provider)
        audit = AuditService(log_file=tmp_path / "test_audit.log")
        orch = AgentOrchestrator(registry=registry, audit_service=audit)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _mock_chat_response("result")

        mock_health = MagicMock()
        mock_health.status_code = 200

        with patch.object(httpx, "get", return_value=mock_health), \
             patch.object(httpx, "post", return_value=mock_resp):
            orch.run("test task")

        records = audit.get_recent()
        assert len(records) == 1
        assert records[0].metadata["provider"] == "llama_cpp"
        assert records[0].metadata["local_inference"] is True


# --------------------------------- configured default model tests


class TestConfiguredDefaultModel:
    """Verify that the configured default model is Gemma 3 4B (from config)."""

    def test_default_model_id_is_gemma(self) -> None:
        """Config default llm_model_id must be gemma-3-4b-it."""
        from app.config import Settings

        s = Settings(llm_enabled=False)
        assert s.llm_model_id == "gemma-3-4b-it"

    def test_registry_returns_gemma_provider(self) -> None:
        """When registered under 'general', the provider name contains
        the configured model id."""
        registry = ModelRegistry()
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            model_id="gemma-3-4b-it",
        )
        registry.register("general", provider)
        resolved = registry.get("general")
        assert "gemma-3-4b-it" in resolved.get_name()

    def test_provider_uses_configured_local_endpoint(self) -> None:
        """Provider must use the configured local llama.cpp endpoint."""
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            model_id="gemma-3-4b-it",
        )
        assert provider.get_base_url() == "http://127.0.0.1:8080"
        assert provider.get_provider_type() == "llama_cpp"

    def test_no_cloud_provider_used(self) -> None:
        """Provider type must be llama_cpp, never a cloud provider."""
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            model_id="gemma-3-4b-it",
        )
        assert provider.get_provider_type() != "openai"
        assert provider.get_provider_type() != "anthropic"
        assert provider.get_provider_type() != "cloud"
        assert provider.get_provider_type() == "llama_cpp"

    def test_missing_local_server_produces_controlled_error(self) -> None:
        """When the llama.cpp server is not running, generate() must raise
        LlamaCppProviderError (not an unhandled crash)."""
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            model_id="gemma-3-4b-it",
        )
        request = GenerationRequest(prompt="test")
        with patch.object(
            httpx, "post", side_effect=httpx.ConnectError("Connection refused")
        ):
            with pytest.raises(LlamaCppProviderError, match="Cannot connect"):
                provider.generate(request)


# --------------------------------- multimodal readiness tests


class TestMultimodalReadiness:
    """Verify the provider abstraction can express multimodal capability
    without actually implementing vision in this phase."""

    def test_vision_disabled_by_default(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        cap = provider.get_capabilities()
        assert cap.supports_vision is False

    def test_vision_can_be_enabled(self) -> None:
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            supports_vision=True,
        )
        cap = provider.get_capabilities()
        assert cap.supports_vision is True

    def test_model_path_accessor(self) -> None:
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            model_path="models/gemma-3-4b-it-Q4_K_M.gguf",
        )
        assert provider.get_model_path() == "models/gemma-3-4b-it-Q4_K_M.gguf"

    def test_model_path_none_by_default(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        assert provider.get_model_path() is None

    def test_model_id_accessor(self) -> None:
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            model_id="gemma-3-4b-it",
        )
        assert provider.get_model_id() == "gemma-3-4b-it"

    def test_context_window_configurable(self) -> None:
        provider = LlamaCppProvider(
            base_url="http://127.0.0.1:8080",
            max_context_tokens=131072,
        )
        cap = provider.get_capabilities()
        assert cap.max_context_tokens == 131072


# ----------------------------------- granular health status tests


class TestHealthStatus:
    """Tests for LlamaCppProvider.health_status() which distinguishes
    available / unavailable / timeout / misconfigured."""

    def test_health_status_available(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        with patch.object(httpx, "get", return_value=mock_resp):
            assert provider.health_status() == "available"

    def test_health_status_unavailable_on_connect_error(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        with patch.object(httpx, "get", side_effect=httpx.ConnectError("refused")):
            assert provider.health_status() == "unavailable"

    def test_health_status_timeout(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        with patch.object(httpx, "get", side_effect=httpx.TimeoutException("slow")):
            assert provider.health_status() == "timeout"

    def test_health_status_misconfigured_on_non_200(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        with patch.object(httpx, "get", return_value=mock_resp):
            assert provider.health_status() == "misconfigured"

    def test_health_status_unavailable_on_os_error(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        with patch.object(httpx, "get", side_effect=OSError("network unreachable")):
            assert provider.health_status() == "unavailable"

    def test_is_available_delegates_to_health_status(self) -> None:
        """is_available() should be True iff health_status() == 'available'."""
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        with patch.object(httpx, "get", return_value=mock_resp):
            assert provider.is_available() is True
        with patch.object(httpx, "get", side_effect=httpx.ConnectError("no")):
            assert provider.is_available() is False


# ----------------------------------- models health API enhanced tests


class TestModelsHealthAPIEnhanced:
    """Tests for the enhanced /models/health endpoint that reports
    granular status and model_path."""

    @pytest.fixture()
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_health_returns_status_field(self, client) -> None:
        data = client.get("/models/health").json()
        model = data["models"][0]
        assert model["status"] in ("available", "unavailable", "timeout", "misconfigured")

    def test_health_returns_model_path(self, client) -> None:
        data = client.get("/models/health").json()
        model = data["models"][0]
        # model_path key must exist (may be None for DummyLocalModel)
        assert "model_path" in model

    def test_health_returns_provider_field(self, client) -> None:
        data = client.get("/models/health").json()
        model = data["models"][0]
        assert "provider" in model


# -------------------------------- multimodal request/response model tests


class TestMultimodalRequestModels:
    """Tests for ImageInput and GenerationRequest.images added for
    future multimodal support."""

    def test_generation_request_images_default_none(self) -> None:
        req = GenerationRequest(prompt="Hello")
        assert req.images is None

    def test_generation_request_accepts_images(self) -> None:
        from app.models.base import ImageInput
        img = ImageInput(path="/tmp/test.png", media_type="image/png")
        req = GenerationRequest(prompt="Describe this", images=[img])
        assert len(req.images) == 1
        assert req.images[0].path == "/tmp/test.png"

    def test_image_input_base64(self) -> None:
        from app.models.base import ImageInput
        img = ImageInput(base64_data="abc123", media_type="image/jpeg")
        assert img.base64_data == "abc123"
        assert img.media_type == "image/jpeg"
        assert img.path is None

    def test_image_input_default_media_type(self) -> None:
        from app.models.base import ImageInput
        img = ImageInput(path="/tmp/x.png")
        assert img.media_type == "image/png"

    def test_provider_ignores_images_in_text_mode(self) -> None:
        """LlamaCppProvider (text-only) should still work when images
        are supplied — it just ignores them."""
        from app.models.base import ImageInput
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        img = ImageInput(path="/tmp/test.png")
        request = GenerationRequest(prompt="Describe", images=[img])

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _mock_chat_response("A nice image")

        with patch.object(httpx, "post", return_value=mock_resp):
            response = provider.generate(request)

        assert response.text == "A nice image"


# ------------------------------------- security enforcement tests


class TestSecurityEnforcement:
    """Verify that the local-only endpoint constraint is rigorously enforced
    across all relevant code paths."""

    @pytest.mark.parametrize("url", [
        "http://api.openai.com/v1",
        "https://api.anthropic.com/v1",
        "http://192.168.1.100:8080",
        "http://10.0.0.1:8080",
        "http://my-cloud-gpu.example.com:8080",
        "http://172.16.0.1:8080",
    ])
    def test_reject_external_urls(self, url: str) -> None:
        with pytest.raises(LocalEndpointError):
            LlamaCppProvider(base_url=url)

    @pytest.mark.parametrize("url", [
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "http://[::1]:8080",
        "http://0.0.0.0:8080",
    ])
    def test_accept_local_urls(self, url: str) -> None:
        provider = LlamaCppProvider(base_url=url)
        assert provider.get_base_url() == url

    def test_base_url_immutable_after_init(self) -> None:
        """Base URL must not change after construction."""
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        _ = provider.get_name()
        _ = provider.get_capabilities()
        assert provider.get_base_url() == "http://127.0.0.1:8080"

    def test_provider_type_always_llama_cpp(self) -> None:
        provider = LlamaCppProvider(base_url="http://127.0.0.1:8080")
        assert provider.get_provider_type() == "llama_cpp"


# -------------------------------- mmproj / config tests


class TestMmprojConfig:
    """Verify the config includes llm_mmproj_path for future multimodal."""

    def test_config_has_mmproj_path(self) -> None:
        from app.config import Settings
        s = Settings(llm_enabled=False)
        assert hasattr(s, "llm_mmproj_path")
        assert "mmproj" in s.llm_mmproj_path


# -------------------------------- inference endpoint & fallback tests


class TestModelInferenceEndpoint:
    """Tests for POST /models/inference and fallback handling."""

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as c:
            yield c

    def test_inference_endpoint_success_with_local(self, client) -> None:
        resp = client.post(
            "/models/inference",
            json={"prompt": "Explain air-gap", "model_name": "local"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "text" in data
        assert data["model_name"] == "dummy-local"
        assert data["provider"] == "dummy"
        assert data["duration_ms"] >= 0

    def test_inference_endpoint_empty_prompt_rejected(self, client) -> None:
        resp = client.post(
            "/models/inference",
            json={"prompt": "   ", "model_name": "local"},
        )
        assert resp.status_code == 422

    def test_inference_endpoint_unknown_model_returns_404(self, client) -> None:
        resp = client.post(
            "/models/inference",
            json={"prompt": "Hello", "model_name": "non-existent-model"},
        )
        assert resp.status_code == 404

    def test_inference_fallback_when_general_server_down(self, monkeypatch) -> None:
        monkeypatch.setenv("SAW_LLM_ENABLED", "true")
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        with TestClient(app) as client:
            # Requesting "general" while llama-server is down falls back to "local"
            with patch.object(httpx, "get", side_effect=httpx.ConnectError("refused")):
                resp = client.post(
                    "/models/inference",
                    json={"prompt": "Summarize policy", "model_name": "general"},
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["fallback_used"] is True
            assert "text" in data
