"""Tests for /health and /hardware API endpoints."""

import pytest


class TestHealthEndpoint:
    """GET /health returns comprehensive status."""

    def test_health_returns_200(self, test_client):
        resp = test_client.get("/health")
        assert resp.status_code == 200

    def test_health_status_is_healthy(self, test_client):
        data = test_client.get("/health").json()
        assert data["status"] == "healthy"

    def test_health_has_required_keys(self, test_client):
        data = test_client.get("/health").json()
        for key in ("status", "version", "models_registered", "tools_registered", "subsystems"):
            assert key in data, f"Missing key: {key}"

    def test_subsystems_network_compliant(self, test_client):
        data = test_client.get("/health").json()
        network = data["subsystems"]["network"]
        assert network["status"] == "compliant"


class TestHardwareEndpoint:
    """GET /hardware returns hardware snapshot."""

    def test_hardware_returns_200(self, test_client):
        resp = test_client.get("/hardware")
        assert resp.status_code == 200

    def test_hardware_has_required_keys(self, test_client):
        data = test_client.get("/hardware").json()
        for key in ("hostname", "cpu", "memory", "gpu", "disk", "inference_capable", "air_gap_safe"):
            assert key in data, f"Missing key: {key}"
