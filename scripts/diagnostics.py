#!/usr/bin/env python3
"""
Performance diagnostics for the local AI runtime.

Measures latency, throughput, VRAM usage, and model metadata
for the Gemma 3 4B model served by llama.cpp on the RTX 4050.

Usage:
    python scripts/diagnostics.py

Requires:
    - llama.cpp server running at http://127.0.0.1:8080
    - nvidia-smi available (for VRAM reporting)
"""

import json
import os
import subprocess
import sys
import time

import httpx

BASE_URL = os.environ.get("SAW_LLM_BASE_URL", "http://127.0.0.1:8080")
MODEL_ID = os.environ.get("SAW_LLM_MODEL_ID", "gemma-3-4b-it")


def _header(title: str) -> None:
    print(f"\n{'=' * 64}")
    print(f"  {title}")
    print(f"{'=' * 64}")


def _gpu_info() -> dict | None:
    """Query nvidia-smi for GPU utilization and VRAM."""
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=5,
        )
        parts = [p.strip() for p in out.strip().split(",")]
        if len(parts) >= 5:
            return {
                "gpu_name": parts[0],
                "vram_used_mib": int(parts[1]),
                "vram_total_mib": int(parts[2]),
                "gpu_util_pct": int(parts[3]),
                "temp_c": int(parts[4]),
            }
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        pass
    return None


def _server_health() -> dict | None:
    try:
        resp = httpx.get(f"{BASE_URL}/health", timeout=5.0)
        if resp.status_code == 200:
            return resp.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        pass
    return None


def _generate(prompt: str, max_tokens: int = 256) -> dict:
    """Send a chat completion and return timing info."""
    t0 = time.perf_counter()
    resp = httpx.post(
        f"{BASE_URL}/v1/chat/completions",
        json={
            "model": MODEL_ID,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": 0.7,
        },
        timeout=120.0,
    )
    wall = time.perf_counter() - t0
    resp.raise_for_status()
    data = resp.json()

    usage = data.get("usage", {})
    timings = data.get("timings", {})
    text = data["choices"][0]["message"]["content"]

    return {
        "wall_s": wall,
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
        "prompt_ms": timings.get("prompt_ms"),
        "predicted_ms": timings.get("predicted_ms"),
        "predicted_per_second": timings.get("predicted_per_second"),
        "prompt_per_second": timings.get("prompt_per_second"),
        "text_len": len(text),
        "text_preview": text[:200],
    }


def main() -> int:
    _header("LOCAL AI RUNTIME — PERFORMANCE DIAGNOSTICS")

    # ---- Server connectivity ----
    health = _server_health()
    if health is None:
        print("  [ERROR] llama.cpp server not reachable.")
        print(f"          Tried {BASE_URL}/health")
        return 1
    print(f"  Server : {BASE_URL}")
    print(f"  Health : {health}")

    # ---- GPU info ----
    _header("GPU STATUS")
    gpu = _gpu_info()
    if gpu:
        print(f"  GPU          : {gpu['gpu_name']}")
        print(f"  VRAM used    : {gpu['vram_used_mib']} / {gpu['vram_total_mib']} MiB")
        print(f"  GPU util     : {gpu['gpu_util_pct']}%")
        print(f"  Temperature  : {gpu['temp_c']} C")
    else:
        print("  nvidia-smi not available")

    # ---- Benchmark: short prompt ----
    _header("BENCHMARK 1 — Short Prompt (low complexity)")
    try:
        r1 = _generate("What is 2+2? Answer with just the number.", max_tokens=16)
        print(f"  Wall time        : {r1['wall_s']:.3f}s")
        print(f"  Prompt tokens    : {r1['prompt_tokens']}")
        print(f"  Completion tokens: {r1['completion_tokens']}")
        print(f"  Predicted tok/s  : {r1['predicted_per_second']:.1f}" if r1['predicted_per_second'] else "  (no timing)")
        print(f"  Prompt tok/s     : {r1['prompt_per_second']:.1f}" if r1['prompt_per_second'] else "  (no timing)")
        print(f"  Response         : {r1['text_preview']}")
    except Exception as exc:
        print(f"  [ERROR] {exc}")
        return 1

    # ---- Benchmark: medium prompt ----
    _header("BENCHMARK 2 — Medium Prompt (domain knowledge)")
    try:
        r2 = _generate(
            "Explain the difference between preventive and predictive "
            "maintenance in an industrial refinery. Include examples.",
            max_tokens=512,
        )
        print(f"  Wall time        : {r2['wall_s']:.3f}s")
        print(f"  Prompt tokens    : {r2['prompt_tokens']}")
        print(f"  Completion tokens: {r2['completion_tokens']}")
        print(f"  Predicted tok/s  : {r2['predicted_per_second']:.1f}" if r2['predicted_per_second'] else "  (no timing)")
        print(f"  Prompt tok/s     : {r2['prompt_per_second']:.1f}" if r2['prompt_per_second'] else "  (no timing)")
        print(f"  Response length  : {r2['text_len']} chars")
    except Exception as exc:
        print(f"  [ERROR] {exc}")
        return 1

    # ---- Benchmark: repeated short (latency consistency) ----
    _header("BENCHMARK 3 — Latency Consistency (5 quick requests)")
    latencies = []
    for i in range(5):
        try:
            r = _generate(f"Say hello in one word. Attempt {i+1}.", max_tokens=8)
            latencies.append(r["wall_s"])
            print(f"  Run {i+1}: {r['wall_s']:.3f}s  ({r['completion_tokens']} tokens)")
        except Exception as exc:
            print(f"  Run {i+1}: ERROR — {exc}")

    if latencies:
        avg = sum(latencies) / len(latencies)
        mn = min(latencies)
        mx = max(latencies)
        print(f"\n  Avg: {avg:.3f}s  Min: {mn:.3f}s  Max: {mx:.3f}s")

    # ---- GPU after load ----
    _header("GPU STATUS (after benchmarks)")
    gpu2 = _gpu_info()
    if gpu2:
        print(f"  VRAM used    : {gpu2['vram_used_mib']} / {gpu2['vram_total_mib']} MiB")
        print(f"  GPU util     : {gpu2['gpu_util_pct']}%")
        print(f"  Temperature  : {gpu2['temp_c']} C")
        if gpu:
            delta = gpu2["vram_used_mib"] - gpu["vram_used_mib"]
            print(f"  VRAM delta   : {'+' if delta >= 0 else ''}{delta} MiB")
    else:
        print("  nvidia-smi not available")

    # ---- Summary ----
    _header("SUMMARY")
    print(f"  Model              : {MODEL_ID}")
    print(f"  Server             : {BASE_URL}")
    if gpu:
        print(f"  GPU                : {gpu['gpu_name']}")
        print(f"  VRAM (model loaded): {gpu['vram_used_mib']} MiB")
    if r1 and r2:
        print(f"  Short prompt tok/s : {r1.get('predicted_per_second', 'N/A')}")
        print(f"  Medium prompt tok/s: {r2.get('predicted_per_second', 'N/A')}")
    if latencies:
        print(f"  Latency (avg/5)    : {avg:.3f}s")
    print(f"\n  All diagnostics completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
