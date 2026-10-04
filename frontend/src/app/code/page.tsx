"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import AppShell from "@/components/shell/AppShell";
import {
  executeCode,
  getExecutionHealth,
  getCodeGenHealth,
  streamCodeGen,
} from "@/lib/api/client";
import type { ExecuteResponse, ExecutionHealth, CodeGenHealth } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  Play,
  Sparkles,
  Terminal,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Container,
  MonitorSmartphone,
  Copy,
  Check,
  Code2,
  Cpu,
  ArrowRight,
  ShieldCheck,
  Zap,
  FileCode,
  Layers,
} from "lucide-react";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CountUp } from "@/components/ui/CountUp";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

// Monaco must be lazy-loaded (no SSR)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#0b1120] text-slate-400 font-mono text-xs">
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin-smooth text-cyan-400" />
        <span>Initializing Monaco IDE Environment...</span>
      </div>
    </div>
  ),
});

// ── Code Templates ─────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { label: string; filename: string; code: string }> = {
  benchmark: {
    label: "Computation Benchmark",
    filename: "benchmark.py",
    code: `# Sovereign AI Sandboxed Code Execution
# Write Python code below. Runs locally inside isolated container sandbox.

import math
import sys
import time

def benchmark_computation(iterations: int = 100_000):
    start = time.perf_counter()
    total = 0.0
    for i in range(1, iterations + 1):
        total += math.sqrt(i) * math.sin(i)
    elapsed = (time.perf_counter() - start) * 1000
    return total, elapsed

print("Python Environment:", sys.version.split()[0])
print("Executing computation benchmark...")
res, duration = benchmark_computation(50_000)
print(f"Benchmark Result: {res:.4f}")
print(f"Elapsed Time: {duration:.2f}ms")
print("Status: Execution completed safely in local environment.")
`,
  },
  parser: {
    label: "JSON & Data Pipeline",
    filename: "data_pipeline.py",
    code: `import json
import statistics

data = [
    {"service": "auth", "latency_ms": 42.1, "status": 200},
    {"service": "vector_db", "latency_ms": 18.5, "status": 200},
    {"service": "llm_infer", "latency_ms": 240.8, "status": 200},
    {"service": "ocr_parser", "latency_ms": 112.4, "status": 200},
]

latencies = [d["latency_ms"] for d in data]
mean_lat = statistics.mean(latencies)
p95_lat = statistics.quantiles(latencies, n=20)[-1]

print("--- Telemetry Report ---")
print(f"Total Services Monitored: {len(data)}")
print(f"Mean Latency: {mean_lat:.2f} ms")
print(f"P95 Latency:  {p95_lat:.2f} ms")
`,
  },
  matrix: {
    label: "Matrix Math",
    filename: "matrix.py",
    code: `import random

def matrix_multiply(A, B):
    rows_A, cols_A = len(A), len(A[0])
    rows_B, cols_B = len(B), len(B[0])
    assert cols_A == rows_B, "Incompatible dimensions"

    C = [[0.0 for _ in range(cols_B)] for _ in range(rows_A)]
    for i in range(rows_A):
        for j in range(cols_B):
            for k in range(cols_A):
                C[i][j] += A[i][k] * B[k][j]
    return C

A = [[1.5, 2.0], [3.0, 4.5]]
B = [[2.0, 0.5], [1.0, 3.0]]
result = matrix_multiply(A, B)

print("Matrix Product Result:")
for row in result:
    print(" ", row)
`,
  },
};

const PROMPT_PRESETS = [
  { label: "Add Type Annotations", prompt: "Add strict typing annotations and docstrings with return types to the active code." },
  { label: "Write Pytest Suite", prompt: "Generate a comprehensive unit test suite using pytest with edge cases for this module." },
  { label: "Optimize Performance", prompt: "Refactor this Python code to optimize time and memory complexity while maintaining exact semantics." },
  { label: "Security & Sanity Audit", prompt: "Audit this code for potential memory leaks, unhandled exceptions, and air-gapped sandboxing constraints." },
];

export default function CodePage() {
  const [activeTemplate, setActiveTemplate] = useState<string>("benchmark");
  const [code, setCode] = useState(TEMPLATES.benchmark.code);
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ExecuteResponse | null>(null);
  const [copiedOut, setCopiedOut] = useState(false);

  // AI Coder state
  const [coderPrompt, setCoderPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [coderSummary, setCoderSummary] = useState("");

  // Health state
  const [execHealth, setExecHealth] = useState<ExecutionHealth | null>(null);
  const [coderHealth, setCoderHealth] = useState<CodeGenHealth | null>(null);

  const outputRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);

  // Check health on mount
  useEffect(() => {
    let mounted = true;
    getExecutionHealth()
      .then((h) => {
        if (mounted) setExecHealth(h);
      })
      .catch(() => {
        if (mounted)
          setExecHealth({
                            status: "unavailable",
                            docker_available: false,
                            engine: "local_fallback",
                            sandboxed: false,
                            security_profile: "none",
                            allow_unsandboxed: false,
                            restrictions: null,
                          });
      });

    getCodeGenHealth()
      .then((h) => {
        if (mounted) setCoderHealth(h);
      })
      .catch(() => {
        if (mounted)
          setCoderHealth({
            status: "unavailable",
            model: "qwen3-4b",
            endpoint: "http://127.0.0.1:9090",
          });
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSelectTemplate = (key: string) => {
    setActiveTemplate(key);
    setCode(TEMPLATES[key].code);
  };

  // Run code handler
  const handleRun = useCallback(async () => {
    if (isRunning || !code.trim()) return;
    setIsRunning(true);
    setOutput(["[sandbox] Spawning execution sandbox container..."]);
    setLastResult(null);

    try {
      const res = await executeCode({
        code,
        language: "python",
        timeout: 30,
      });
      setLastResult(res);

      const lines: string[] = [];
      if (res.stdout) lines.push(res.stdout);
      if (res.stderr) lines.push(`[stderr]\n${res.stderr}`);
      if (lines.length === 0) lines.push("(Process returned no output)");

      setOutput(lines);
    } catch (err) {
      setOutput([
        `[system error] Execution failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ]);
    } finally {
      setIsRunning(false);
    }
  }, [code, isRunning]);

  // AI Code generator handler
  const handleGenerate = useCallback(async () => {
    if (!coderPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setCoderSummary("");

    let streamedCode = "";

    try {
      const fullPrompt = `${coderPrompt}\n\nCurrent Code Context:\n\`\`\`python\n${code}\n\`\`\``;
      for await (const { event, data } of streamCodeGen({
        prompt: fullPrompt,
      })) {
        if (event === "token") {
          streamedCode += JSON.parse(data);
          setCode(streamedCode);
        } else if (event === "done") {
          const info = JSON.parse(data);
          setCoderSummary(`Generated ${info.tokens ?? 0} tokens in ${((info.generation_time_ms ?? 0) / 1000).toFixed(2)}s`);
        } else if (event === "error") {
          setOutput([`AI Error: ${JSON.parse(data)}`]);
        }
      }
    } catch (err) {
      setOutput([
        `Generation error: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    } finally {
      setIsGenerating(false);
    }
  }, [coderPrompt, isGenerating, code]);

  // Keyboard shortcut Ctrl+Enter or Cmd+Enter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRun]);

  const copyOutput = useCallback(() => {
    navigator.clipboard.writeText(output.join(""));
    setCopiedOut(true);
    setTimeout(() => setCopiedOut(false), 2000);
  }, [output]);

  const handleEditorMount = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  return (
    <AppShell>
      <div className="flex flex-col h-full bg-[#070a12] overflow-hidden">
        {/* ── Top IDE Toolbar ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-white/[0.08] bg-slate-950/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Run Button */}
            <ShimmerButton
              onClick={handleRun}
              loading={isRunning}
              disabled={!code.trim()}
              size="sm"
              variant="primary"
            >
              <Play size={13} fill="currentColor" />
              <span>Execute Sandbox</span>
            </ShimmerButton>

            {/* Clear Output */}
            <button
              onClick={() => {
                setOutput([]);
                setLastResult(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 border border-white/10 transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Clear Console</span>
            </button>

            <div className="w-px h-5 bg-white/10" />

            {/* Template Selector Tabs */}
            <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10">
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => handleSelectTemplate(key)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer",
                    activeTemplate === key
                      ? "bg-cyan-950/60 text-cyan-300 font-bold shadow-xs border border-cyan-500/30"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {t.filename}
                </button>
              ))}
            </div>

            {/* Engine indicator badge */}
            <div className="flex items-center gap-1.5">
              {execHealth?.docker_available ? (
                <StatusBadge status="success" label="Docker Isolated" size="sm" />
              ) : (
                <StatusBadge status="warning" label="Host Subprocess" size="sm" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            {lastResult && (
              <span className="flex items-center gap-1 bg-slate-900 px-2.5 py-0.5 rounded-lg border border-white/10">
                <Zap size={11} className="text-cyan-400" />
                <span>engine: {lastResult.engine}</span>
              </span>
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 rounded-lg bg-slate-900 border border-white/10 text-[10px] font-mono text-slate-300">
              ⌘+Enter to Run
            </kbd>
          </div>
        </div>

        {/* ── Main layout: Split Editor & AI Panel ─────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Editor + Output Terminal */}
          <div className="flex flex-col flex-1 min-w-0 border-r border-white/[0.08]">
            {/* Monaco Editor */}
            <div className="flex-1 min-h-0 bg-[#090d16]">
              <MonacoEditor
                height="100%"
                language="python"
                theme="vs-dark"
                value={code}
                onChange={(v) => setCode(v ?? "")}
                onMount={handleEditorMount}
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Geist Mono', monospace",
                  minimap: { enabled: false },
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  tabSize: 4,
                  insertSpaces: true,
                  automaticLayout: true,
                  padding: { top: 14, bottom: 14 },
                  renderLineHighlight: "all",
                  bracketPairColorization: { enabled: true },
                }}
              />
            </div>

            {/* Output Terminal Console */}
            <div className="border-t border-white/[0.08] bg-[#06080e] flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-slate-950/60">
                <div className="flex items-center gap-2 text-xs text-slate-300 font-mono">
                  <Terminal size={13} className="text-cyan-400" />
                  <span className="font-bold">Sandbox Console (Stdout / Stderr)</span>
                  {lastResult && (
                    <span
                      className={cn(
                        "ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-mono font-bold",
                        lastResult.exit_code === 0
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/30",
                      )}
                    >
                      {lastResult.exit_code === 0 ? (
                        <CheckCircle2 size={11} />
                      ) : (
                        <XCircle size={11} />
                      )}
                      exit code {lastResult.exit_code}
                    </span>
                  )}
                </div>

                <button
                  onClick={copyOutput}
                  className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-white transition-colors px-2 py-0.5 rounded-md hover:bg-white/5 cursor-pointer"
                  title="Copy terminal output"
                >
                  {copiedOut ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div
                ref={outputRef}
                className="h-[175px] overflow-y-auto px-4 py-3 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-text"
              >
                {output.length === 0 ? (
                  <span className="text-slate-500">
                    Console idle. Click &quot;Execute Sandbox&quot; or press ⌘+Enter to run.
                  </span>
                ) : (
                  output.map((line, i) => <span key={i}>{line}</span>)
                )}
              </div>
            </div>
          </div>

          {/* Right: AI Code Copilot Panel */}
          <div className="w-[380px] shrink-0 flex flex-col bg-slate-950/90 border-l border-white/[0.08]">
            <div className="px-4 py-3.5 border-b border-white/[0.08] bg-slate-900/40">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Sparkles size={13} />
                </div>
                <h3 className="text-xs font-bold text-white tracking-tight">
                  Local AI Coder Copilot
                </h3>
                <span className="ml-auto text-[9px] font-mono uppercase bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-md border border-cyan-500/20 font-bold">
                  QWEN3 4B
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                Stream code transformations and completions directly into the editor.
              </p>
            </div>

            {/* Prompt presets */}
            <div className="p-3 border-b border-white/[0.08] space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Copilot Actions
              </span>
              <div className="flex flex-col gap-1.5">
                {PROMPT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setCoderPrompt(p.prompt)}
                    className="flex items-center justify-between text-left px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-white/10 hover:border-cyan-500/30 text-xs text-slate-300 hover:text-white transition-all cursor-pointer group"
                  >
                    <span className="truncate font-medium">{p.label}</span>
                    <ArrowRight size={12} className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt input */}
            <div className="p-4 flex-1 flex flex-col gap-3">
              <textarea
                value={coderPrompt}
                onChange={(e) => setCoderPrompt(e.target.value)}
                placeholder="Describe what code to generate, refactor, or audit..."
                rows={4}
                className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 outline-none transition-all font-medium"
              />

              <ShimmerButton
                onClick={handleGenerate}
                loading={isGenerating}
                disabled={!coderPrompt.trim()}
                variant="primary"
                size="md"
                className="w-full"
              >
                <Sparkles size={14} />
                <span>Stream Code to Editor</span>
              </ShimmerButton>

              {coderSummary && (
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] font-mono text-cyan-300">
                  {coderSummary}
                </div>
              )}
            </div>

            {/* Model Telemetry Footer */}
            <div className="p-3 border-t border-white/[0.08] bg-slate-900/40 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Cpu size={11} className="text-cyan-400" />
                <span>endpoint: coder:9090</span>
              </span>
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <ShieldCheck size={11} /> 100% Offline
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
