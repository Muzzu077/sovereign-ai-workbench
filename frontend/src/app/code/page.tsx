"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import AppShell from "@/components/shell/AppShell";
import {
  executeCode,
  getExecutionHealth,
  getCodeGenHealth,
  streamCodeGen,
  getExecutionWsUrl,
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
  Download,
} from "lucide-react";

// Monaco must be lazy-loaded (no SSR)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-wb-bg-inset text-wb-text-muted">
      Loading editor...
    </div>
  ),
});

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CODE = `# Welcome to the Sovereign AI Code Sandbox
# Write Python code here and click "Run" or press Ctrl+Enter

def fibonacci(n: int) -> list[int]:
    """Generate first n Fibonacci numbers."""
    if n <= 0:
        return []
    fib = [0, 1]
    for _ in range(2, n):
        fib.append(fib[-1] + fib[-2])
    return fib[:n]

result = fibonacci(10)
print("Fibonacci:", result)
print(f"Sum: {sum(result)}")
`;

// ── Page Component ────────────────────────────────────────────────────────

export default function CodePage() {
  // Editor state
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ExecuteResponse | null>(null);

  // AI Coder state
  const [coderPrompt, setCoderPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [coderSummary, setCoderSummary] = useState("");

  // Health state
  const [execHealth, setExecHealth] = useState<ExecutionHealth | null>(null);
  const [coderHealth, setCoderHealth] = useState<CodeGenHealth | null>(null);

  const outputRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);

  // ── Check health on mount ──────────────────────────────────────────────

  useEffect(() => {
    getExecutionHealth()
      .then(setExecHealth)
      .catch(() => setExecHealth(null));
    getCodeGenHealth()
      .then(setCoderHealth)
      .catch(() => setCoderHealth(null));
  }, []);

  // ── Auto-scroll output ─────────────────────────────────────────────────

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // ── Run code ───────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    if (!code.trim() || isRunning) return;
    setIsRunning(true);
    setOutput([">>> Running code...\n"]);
    setLastResult(null);

    try {
      const result = await executeCode({
        code,
        language: "python",
        timeout: 30,
      });
      setLastResult(result);

      const lines: string[] = [];
      if (result.stdout) lines.push(result.stdout);
      if (result.stderr) lines.push(`\n--- stderr ---\n${result.stderr}`);
      lines.push(
        `\n[${result.engine}] Process exited with code ${result.exit_code}`
      );
      setOutput(lines);
    } catch (err) {
      setOutput([
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    } finally {
      setIsRunning(false);
    }
  }, [code, isRunning]);

  // ── Generate code with AI ──────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!coderPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setCoderSummary("");

    let generatedCode = "";

    try {
      for await (const { event, data } of streamCodeGen({
        prompt: coderPrompt,
        max_tokens: 2000,
      })) {
        if (event === "summary") {
          setCoderSummary(JSON.parse(data));
        } else if (event === "token") {
          generatedCode += JSON.parse(data);
          setCode(generatedCode);
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
  }, [coderPrompt, isGenerating]);

  // ── Keyboard shortcut ──────────────────────────────────────────────────

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

  // ── Copy output to clipboard ───────────────────────────────────────────

  const copyOutput = useCallback(() => {
    navigator.clipboard.writeText(output.join(""));
  }, [output]);

  // ── Editor mount callback ──────────────────────────────────────────────

  const handleEditorMount = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-wb-border bg-wb-surface">
          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isRunning || !code.trim()}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              isRunning
                ? "bg-wb-surface-active text-wb-text-muted cursor-not-allowed"
                : "bg-wb-accent text-white hover:bg-wb-accent-hover"
            )}
          >
            {isRunning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            {isRunning ? "Running..." : "Run"}
          </button>

          {/* Clear */}
          <button
            onClick={() => {
              setOutput([]);
              setLastResult(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-wb-text-secondary hover:bg-wb-surface-hover transition-colors"
          >
            <Trash2 size={14} />
            Clear
          </button>

          <div className="w-px h-6 bg-wb-border" />

          {/* Engine indicator */}
          <div className="flex items-center gap-1.5 text-xs text-wb-text-muted">
            {execHealth?.docker_available ? (
              <>
                <Container size={14} className="text-wb-accent" />
                Docker sandbox
              </>
            ) : (
              <>
                <MonitorSmartphone size={14} className="text-wb-warning" />
                Local fallback
              </>
            )}
          </div>

          <div className="flex-1" />

          {/* Shortcut hint */}
          <span className="text-xs text-wb-text-faint">
            Ctrl+Enter to run
          </span>
        </div>

        {/* ── Main layout ─────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Editor + Output */}
          <div className="flex flex-col flex-1 min-w-0 border-r border-wb-border">
            {/* Monaco Editor */}
            <div className="flex-1 min-h-0">
              <MonacoEditor
                height="100%"
                language="python"
                theme="vs-light"
                value={code}
                onChange={(v) => setCode(v ?? "")}
                onMount={handleEditorMount}
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  minimap: { enabled: false },
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  tabSize: 4,
                  insertSpaces: true,
                  automaticLayout: true,
                  padding: { top: 16, bottom: 16 },
                  renderLineHighlight: "line",
                  bracketPairColorization: { enabled: true },
                }}
              />
            </div>

            {/* Output terminal */}
            <div className="border-t border-wb-border bg-[#1c1917]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-stone-700">
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <Terminal size={14} />
                  Output
                  {lastResult && (
                    <span
                      className={cn(
                        "ml-2 inline-flex items-center gap-1",
                        lastResult.exit_code === 0
                          ? "text-green-400"
                          : "text-red-400"
                      )}
                    >
                      {lastResult.exit_code === 0 ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <XCircle size={12} />
                      )}
                      exit {lastResult.exit_code}
                    </span>
                  )}
                </div>
                <button
                  onClick={copyOutput}
                  className="p-1 text-stone-500 hover:text-stone-300 transition-colors"
                  title="Copy output"
                >
                  <Copy size={14} />
                </button>
              </div>
              <div
                ref={outputRef}
                className="h-[200px] overflow-y-auto px-4 py-3 font-mono text-sm text-stone-200 whitespace-pre-wrap"
              >
                {output.length === 0 ? (
                  <span className="text-stone-600">
                    Output will appear here after running code...
                  </span>
                ) : (
                  output.map((line, i) => <span key={i}>{line}</span>)
                )}
              </div>
            </div>
          </div>

          {/* Right: AI Coder panel */}
          <div className="w-[380px] flex flex-col bg-wb-bg-inset">
            <div className="px-4 py-3 border-b border-wb-border bg-wb-surface">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-wb-accent" />
                <h3 className="text-sm font-semibold text-wb-text">
                  AI Code Generator
                </h3>
              </div>
              <p className="text-xs text-wb-text-muted mt-1">
                Describe what you need — the local LLM generates Python code.
              </p>
            </div>

            <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
              {/* Status */}
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    coderHealth?.status === "ok"
                      ? "bg-wb-success"
                      : "bg-wb-error"
                  )}
                />
                <span className="text-wb-text-muted">
                  {coderHealth?.status === "ok"
                    ? `${coderHealth.model} ready`
                    : "Coder model unreachable"}
                </span>
              </div>

              {/* Prompt textarea */}
              <textarea
                value={coderPrompt}
                onChange={(e) => setCoderPrompt(e.target.value)}
                placeholder="e.g., Write a CSV parser that handles quoted fields and outputs statistics..."
                className="w-full h-32 px-3 py-2 rounded-lg border border-wb-border bg-wb-surface text-sm text-wb-text placeholder:text-wb-text-faint resize-none focus:outline-none focus:ring-2 focus:ring-wb-accent/30 focus:border-wb-accent transition-colors"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={
                  isGenerating ||
                  !coderPrompt.trim() ||
                  coderHealth?.status !== "ok"
                }
                className={cn(
                  "flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isGenerating || !coderPrompt.trim()
                    ? "bg-wb-surface-active text-wb-text-muted cursor-not-allowed"
                    : "bg-wb-accent text-white hover:bg-wb-accent-hover"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate Code
                  </>
                )}
              </button>

              {/* Summary */}
              {coderSummary && (
                <div className="p-3 rounded-lg bg-wb-accent-subtle border border-wb-accent-muted">
                  <p className="text-xs font-medium text-wb-accent-text">
                    {coderSummary}
                  </p>
                </div>
              )}

              {/* Quick prompts */}
              <div className="mt-auto pt-4 border-t border-wb-border">
                <p className="text-xs font-medium text-wb-text-secondary mb-2">
                  Quick prompts
                </p>
                <div className="flex flex-col gap-1.5">
                  {[
                    "Sort a list of dictionaries by multiple keys",
                    "Read a CSV file and compute column statistics",
                    "Implement binary search with edge cases",
                    "Generate a Fibonacci spiral as ASCII art",
                    "Parse JSON log file and find error patterns",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setCoderPrompt(prompt)}
                      className="text-left text-xs px-3 py-2 rounded-md text-wb-text-secondary hover:bg-wb-surface-hover hover:text-wb-text transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
