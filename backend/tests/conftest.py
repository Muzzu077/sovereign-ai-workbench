"""Common test fixtures for the Sovereign AI Workbench backend."""

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def settings():
    """Return a Settings instance with default (loopback) values."""
    from app.config import Settings

    return Settings()


@pytest.fixture()
def test_client():
    """Create a TestClient wired to the full FastAPI application.

    Disables the real LLM provider so tests don't need a running
    llama.cpp server.
    """
    os.environ.setdefault("SAW_LLM_ENABLED", "false")
    from app.main import create_app

    app = create_app()
    with TestClient(app) as client:
        yield client
