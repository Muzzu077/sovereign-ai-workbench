"""
Shared test configuration.

Sets SAW_LLM_ENABLED=false so that all unit tests use DummyLocalModel
instead of requiring a real llama.cpp server.
"""

import os

# Must be set before any Settings() instantiation
os.environ["SAW_LLM_ENABLED"] = "false"
