"""
Shared test configuration.

Sets SAW_LLM_ENABLED=false so that all unit tests use DummyLocalModel
instead of requiring a real llama.cpp server.

Provides an autouse fixture that cleans up SAW_ environment variables
after each test to prevent inter-test leakage.
"""

import os

import pytest

# Must be set before any Settings() instantiation
os.environ["SAW_LLM_ENABLED"] = "false"

# List of SAW_ env vars that may be set by individual test fixtures
# and must be cleaned up after each test.
_MANAGED_ENV_VARS = [
    "SAW_UPLOAD_DIR",
    "SAW_DOCUMENT_DB_PATH",
    "SAW_KNOWLEDGE_DB_PATH",
    "SAW_VECTOR_STORAGE_PATH",
    "SAW_AUDIT_LOG_FILE",
]


@pytest.fixture(autouse=True)
def _clean_saw_env():
    """Save and restore SAW_ environment variables around each test.

    This prevents env var leakage between tests when fixtures set
    SAW_UPLOAD_DIR, SAW_DOCUMENT_DB_PATH, etc. to temporary paths.
    """
    saved = {key: os.environ.get(key) for key in _MANAGED_ENV_VARS}
    yield
    for key, val in saved.items():
        if val is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = val
