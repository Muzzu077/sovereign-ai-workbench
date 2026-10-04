"""Tests for app.security.network_monitor."""

import pytest

from app.security.network_monitor import NetworkMonitor, is_loopback_url


class TestIsLoopbackUrl:
    """Validate the module-level is_loopback_url helper."""

    @pytest.mark.parametrize(
        "url",
        [
            "http://localhost:8080",
            "http://127.0.0.1:9090",
            "http://[::1]:5000",
            "http://0.0.0.0:3000",
            "https://localhost/v1/chat",
        ],
    )
    def test_loopback_variants_return_true(self, url):
        assert is_loopback_url(url) is True

    @pytest.mark.parametrize(
        "url",
        [
            "https://api.openai.com",
            "http://192.168.1.100:8080",
            "http://example.org",
            "https://huggingface.co/models",
        ],
    )
    def test_external_urls_return_false(self, url):
        assert is_loopback_url(url) is False


class TestNetworkMonitorCompliance:
    """Verify check_compliance() statuses."""

    def test_all_loopback_is_compliant(self):
        monitor = NetworkMonitor(
            configured_endpoints={
                "llm_server": "http://127.0.0.1:8080",
                "coder_server": "http://localhost:9090",
            }
        )
        result = monitor.check_compliance()
        assert result["status"] == "compliant"
        assert result["violations"] == []

    def test_one_external_is_non_compliant(self):
        monitor = NetworkMonitor(
            configured_endpoints={
                "llm_server": "http://127.0.0.1:8080",
                "bad_endpoint": "https://api.openai.com",
            }
        )
        result = monitor.check_compliance()
        assert result["status"] == "non_compliant"
        assert "bad_endpoint" in result["violations"]
        assert len(result["violations"]) == 1

    def test_no_endpoints_returns_no_endpoints(self):
        monitor = NetworkMonitor(configured_endpoints={})
        result = monitor.check_compliance()
        assert result["status"] == "no_endpoints"
        assert result["violations"] == []
        assert result["endpoints"] == []
