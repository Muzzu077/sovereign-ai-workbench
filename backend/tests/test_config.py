"""Tests for app.config.Settings and air-gap validation."""

import os

import pytest
from pydantic import ValidationError

from app.config import Settings, _is_loopback


class TestDefaultSettings:
    """Verify default values are loopback-safe."""

    def test_llm_base_url_is_loopback(self, settings):
        assert _is_loopback(settings.llm_base_url)

    def test_coder_base_url_is_loopback(self, settings):
        assert _is_loopback(settings.coder_base_url)

    def test_app_name(self, settings):
        assert settings.app_name == "Sovereign AI Workbench"


class TestAirGapValidator:
    """Air-gap model_validator must reject external URLs."""

    def test_rejects_external_llm_url(self, monkeypatch):
        monkeypatch.setenv("SAW_LLM_BASE_URL", "https://api.openai.com")
        with pytest.raises(ValidationError, match="Air-gap violation"):
            Settings()

    def test_rejects_external_coder_url(self, monkeypatch):
        monkeypatch.setenv("SAW_CODER_BASE_URL", "https://external.com")
        with pytest.raises(ValidationError, match="Air-gap violation"):
            Settings()


class TestIsLoopback:
    """Unit tests for the _is_loopback helper."""

    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1:8080",
            "http://localhost:9090",
            "http://[::1]:8000",
            "http://0.0.0.0:5000",
        ],
    )
    def test_loopback_urls_return_true(self, url):
        assert _is_loopback(url) is True

    @pytest.mark.parametrize(
        "url",
        [
            "https://api.openai.com",
            "https://external.com:443/v1",
            "http://192.168.1.1:8080",
            "http://example.org",
        ],
    )
    def test_external_urls_return_false(self, url):
        assert _is_loopback(url) is False

    def test_empty_string_returns_false(self):
        assert _is_loopback("") is False

    def test_garbage_returns_false(self):
        assert _is_loopback("not a url at all") is False
