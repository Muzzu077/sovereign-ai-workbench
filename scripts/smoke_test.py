#!/usr/bin/env python3
"""
Smoke test for real local AI inference.

Validates the complete end-to-end path:

    POST /agent/run
        -> AgentOrchestrator
        -> ModelRegistry
        -> LlamaCppProvider
        -> http://127.0.0.1:8080
        -> llama.cpp
        -> Gemma 3 4B
        -> real generated response

This script requires a running llama.cpp server.
It does NOT use DummyLocalModel.

Usage:
    python scripts/smoke_test.py

Exit codes:
    0 — all checks passed
    1 — one or more checks failed
"""

import os
import sys
import time

# Ensure LLM is enabled (not the test-suite default)
os.environ.pop("SAW_LLM_ENABLED", None)
os.environ["SAW_LLM_ENABLED"] = "true"

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import httpx
from app.config import get_settings
from app.models.llama_cpp_provider import LlamaCppProvider, LlamaCppProviderError
from app.models.base import GenerationRequest
from app.models.registry import ModelRegistry
from app.security.audit import AuditService
from app.agents.orchestrator import AgentOrchestrator


def _header(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def _pass(msg: str) -> None:
    print(f"  [PASS] {msg}")


def _fail(msg: str) -> None:
    print(f"  [FAIL] {msg}")


def main() -> int:
    settings = get_settings()
    failures = 0

    _header("SMOKE TEST — Real Local AI Inference")
    print(f"  Model ID   : {settings.llm_model_id}")
    print(f"  Model path : {settings.llm_model_path}")
    print(f"  Base URL   : {settings.llm_base_url}")
    print(f"  Provider   : {settings.llm_provider}")
    print(f"  Timeout    : {settings.llm_timeout}s")

    # ---- 1. HTTP connectivity ----
    _header("1. HTTP Connectivity")
    try:
        resp = httpx.get(f"{settings.llm_base_url}/health", timeout=5.0)
        if resp.status_code == 200:
            _pass(f"llama.cpp server reachable at {settings.llm_base_url}")
        else:
            _fail(f"Health returned HTTP {resp.status_code}")
            failures += 1
    except httpx.ConnectError:
        _fail(f"Cannot connect to {settings.llm_base_url} — is llama-server running?")
        print("\n  Start the server with:")
        print(f"    ./llama.cpp/build/bin/llama-server \\")
        print(f"      --model {settings.llm_model_path} \\")
        print(f"      --host 127.0.0.1 --port 8080 \\")
        print(f"      --n-gpu-layers 99 --ctx-size 8192")
        return 1
    except httpx.TimeoutException:
        _fail("Health check timed out")
        return 1

    # ---- 2. Provider health status ----
    _header("2. Provider Health Status")
    provider = LlamaCppProvider(
        base_url=settings.llm_base_url,
        model_id=settings.llm_model_id,
        timeout=settings.llm_timeout,
        model_path=settings.llm_model_path,
    )
    status = provider.health_status()
    if status == "available":
        _pass(f"health_status() = {status}")
    else:
        _fail(f"health_status() = {status}")
        failures += 1

    # ---- 3. Real generation ----
    _header("3. Real Text Generation")
    prompt = (
        "Explain preventive maintenance in an industrial refinery "
        "in 3 concise points."
    )
    print(f"  Prompt: {prompt}")

    request = GenerationRequest(
        prompt=prompt,
        max_tokens=256,
        temperature=0.7,
    )

    t0 = time.perf_counter()
    try:
        response = provider.generate(request)
        elapsed = time.perf_counter() - t0
    except LlamaCppProviderError as exc:
        _fail(f"Generation error: {exc}")
        failures += 1
        elapsed = time.perf_counter() - t0
        response = None

    if response is not None:
        # Model actually responds
        if response.text and len(response.text.strip()) > 0:
            _pass(f"Model responded with {len(response.text)} chars")
        else:
            _fail("Response text is empty")
            failures += 1

        # Response is non-empty
        if response.tokens_used and response.tokens_used > 0:
            _pass(f"Tokens used: {response.tokens_used}")
        else:
            _fail(f"Unexpected tokens_used: {response.tokens_used}")
            failures += 1

        # Response format parsed correctly
        if response.model_name and "llama-cpp" in response.model_name:
            _pass(f"Model name: {response.model_name}")
        else:
            _fail(f"Unexpected model_name: {response.model_name}")
            failures += 1

        if response.metadata.get("provider") == "llama_cpp":
            _pass("Provider metadata = llama_cpp")
        else:
            _fail(f"Provider metadata: {response.metadata.get('provider')}")
            failures += 1

        if response.metadata.get("local") is True:
            _pass("Local inference confirmed")
        else:
            _fail("Metadata does not confirm local inference")
            failures += 1

        # Performance
        print(f"\n  --- Performance ---")
        print(f"  Wall time       : {elapsed:.3f}s")
        print(f"  Tokens used     : {response.tokens_used}")
        if response.tokens_used and elapsed > 0:
            tps = response.tokens_used / elapsed
            print(f"  Approx tok/s    : {tps:.1f}")

        print(f"\n  --- Response (first 500 chars) ---")
        print(f"  {response.text[:500]}")

    # ---- 4. No cloud fallback ----
    _header("4. No Cloud Fallback")
    if provider.get_base_url() in (
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "http://[::1]:8080",
    ):
        _pass(f"Endpoint is local: {provider.get_base_url()}")
    else:
        _fail(f"Endpoint is NOT local: {provider.get_base_url()}")
        failures += 1

    if provider.get_provider_type() == "llama_cpp":
        _pass("Provider type = llama_cpp (no cloud)")
    else:
        _fail(f"Provider type = {provider.get_provider_type()}")
        failures += 1

    # ---- 5. Full orchestrator path ----
    _header("5. Full Orchestrator Path (POST /agent/run equivalent)")
    registry = ModelRegistry()
    registry.register("general", provider)
    audit = AuditService(log_file=settings.audit_log_file)
    orch = AgentOrchestrator(registry=registry, audit_service=audit)

    result = orch.run("What is 2+2? Answer with just the number.")
    if result.execution_status == "success":
        _pass(f"Orchestrator returned success")
        _pass(f"Provider: {result.provider}")
        print(f"  Result: {result.result[:200]}")
    else:
        _fail(f"Orchestrator returned: {result.execution_status}")
        _fail(f"Result: {result.result[:200]}")
        failures += 1

    # ---- 6. Server unavailable behavior ----
    _header("6. Server Unavailable Handling (simulated)")
    bad_provider = LlamaCppProvider(
        base_url="http://127.0.0.1:59999",  # intentionally wrong port
        model_id=settings.llm_model_id,
    )
    bad_status = bad_provider.health_status()
    if bad_status == "unavailable":
        _pass(f"Unreachable server correctly returns: {bad_status}")
    else:
        _fail(f"Expected 'unavailable', got: {bad_status}")
        failures += 1

    bad_req = GenerationRequest(prompt="test")
    try:
        bad_provider.generate(bad_req)
        _fail("Expected LlamaCppProviderError, but generate() succeeded")
        failures += 1
    except LlamaCppProviderError:
        _pass("generate() raises LlamaCppProviderError when server is down")

    # ---- Summary ----
    _header("SUMMARY")
    if failures == 0:
        print("  All checks PASSED.")
    else:
        print(f"  {failures} check(s) FAILED.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
