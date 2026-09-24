"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import {
  listModels,
  getModelsHealth,
  testModelInference,
} from "@/lib/api/client";
import type { ModelInfo, ModelHealthInfo } from "@/lib/api/types";
import { cn, formatDuration, copyToClipboard } from "@/lib/utils";
import {
  Box,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Send,
  Cpu,
  Globe,
  HardDrive,
  Zap,
  Sparkles,
  Copy,
  Check,
  Code,
  Eye,
  FileText,
} from "lucide-react";

interface ModelRow extends ModelInfo {
  health?: ModelHealthInfo;
}

const PRESETS = [
  "Explain what a sovereign AI workbench is in one sentence.",
  "What are the best practices for air-gapped LLM deployment?",
  "Write a Python function to parse JSON safely.",
];

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inference test
  const [testModel, setTestModel] = useState<string | null>(null);
  const [testPrompt, setTestPrompt] = useState(PRESETS[0]);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testMeta, setTestMeta] = useState<{
    model: string;
    provider: string;
    duration: number;
    tokens: number | null;
    fallback: boolean;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [modelList, healthList] = await Promise.all([
        listModels(),
        getModelsHealth(),
      ]);
      const merged: ModelRow[] = modelList.map((m) => ({
        ...m,
        health: healthList.find((h) => h.name === m.name),
      }));
      setModels(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleTest = useCallback(
    async (modelName: string) => {
      setTestModel(modelName);
      setTestResult(null);
      setTestMeta(null);
      setTestLoading(true);
      try {
        const res = await testModelInference({
          prompt: testPrompt,
          model_name: modelName,
        });
        setTestResult(res.text);
        setTestMeta({
          model: res.model_name,
          provider: res.provider,
          duration: res.duration_ms,
          tokens: res.tokens_used,
          fallback: res.fallback_used,
        });
      } catch (err) {
        setTestResult(
          `Error: ${err instanceof Error ? err.message : "Inference failed"}`,
        );
      } finally {
        setTestLoading(false);
      }
    },
    [testPrompt],
  );

  const handleCopy = async () => {
    if (!testResult) return;
    const ok = await copyToClipboard(testResult);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusBadge = (status: string) => {
    const isAvail = status === "available" || status === "healthy" || status === "ok";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
          isAvail
            ? "bg-[var(--color-wb-success-bg)] text-[var(--color-wb-success)]"
            : "bg-[var(--color-wb-warning-bg)] text-[var(--color-wb-warning)]",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isAvail ? "bg-[var(--color-wb-success)]" : "bg-[var(--color-wb-warning)]",
          )}
        />
        {status}
      </span>
    );
  };

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto px-8 py-8 bg-[var(--color-wb-bg)]">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-[var(--color-wb-text)]">
                Local Models & Inference Engine
              </h1>
              <p className="mt-0.5 text-xs text-[var(--color-wb-text-muted)]">
                Manage registered models running on local hardware (llama.cpp / GPU).
              </p>
            </div>
            <button
              onClick={fetchModels}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)] transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(loading && "animate-spin-smooth")} />
              <span>Refresh Models</span>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--color-wb-error-bg)] border border-[var(--color-wb-error-border)] p-3.5 text-xs text-[var(--color-wb-error)]">
              <XCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Test prompt composer */}
          <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--color-wb-text)]">
                Live Test Prompt
              </h2>
              <span className="text-[10px] text-[var(--color-wb-text-muted)]">
                Used when clicking &quot;Test Model&quot; below
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Enter prompt for model evaluation..."
                className="w-full rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-bg)] px-3 py-2 text-xs text-[var(--color-wb-text)] placeholder:text-[var(--color-wb-text-muted)] outline-none focus:border-[var(--color-wb-accent)] transition-colors"
              />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-[var(--color-wb-text-muted)] mr-1">Presets:</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTestPrompt(preset)}
                  className="rounded-md border border-[var(--color-wb-border-subtle)] bg-[var(--color-wb-bg-inset)] px-2 py-0.5 text-[10px] text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)] hover:text-[var(--color-wb-text)] transition-colors cursor-pointer truncate max-w-[240px]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Models list */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-wb-text-muted)]">
              Registered Model Providers ({models.length})
            </h2>

            {loading && models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-xs text-[var(--color-wb-text-muted)] gap-2">
                <Loader2 size={18} className="animate-spin-smooth text-[var(--color-wb-accent)]" />
                <span>Loading model profiles...</span>
              </div>
            ) : models.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-wb-border)] p-12 text-center">
                <Box size={22} className="mb-2 text-[var(--color-wb-text-muted)] opacity-40" />
                <span className="text-xs font-semibold text-[var(--color-wb-text)]">
                  No models registered
                </span>
                <p className="mt-1 text-[11px] text-[var(--color-wb-text-muted)]">
                  Check backend configuration in app/config.py
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {models.map((model) => {
                  const isTestingThis = testLoading && testModel === model.name;
                  const isCurrentResult = testModel === model.name && testResult;

                  return (
                    <div
                      key={model.name}
                      className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-5 shadow-sm space-y-4 hover:border-[var(--color-wb-border-strong)] transition-all"
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-wb-accent-subtle)] border border-[var(--color-wb-accent-muted)] shrink-0">
                            {model.local ? (
                              <Zap size={16} className="text-[var(--color-wb-accent)]" />
                            ) : (
                              <Globe size={16} className="text-[var(--color-wb-accent)]" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-[var(--color-wb-text)]">
                                {model.name === "general" ? "Gemma 3 4B (General)" : model.name}
                              </h3>
                              {model.health && statusBadge(model.health.status)}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-wb-text-muted)]">
                              <span>Provider: <strong className="text-[var(--color-wb-text-secondary)] font-medium">{model.provider_name}</strong></span>
                              <span>·</span>
                              <span className="capitalize">{model.provider_type}</span>
                              {model.local && (
                                <>
                                  <span>·</span>
                                  <span className="text-[var(--color-wb-accent)] font-medium">Local Hardware</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleTest(model.name)}
                          disabled={isTestingThis}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-sm",
                            "bg-[var(--color-wb-accent)] text-white hover:bg-[var(--color-wb-accent-hover)]",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                          )}
                        >
                          {isTestingThis ? (
                            <>
                              <Loader2 size={13} className="animate-spin-smooth" />
                              <span>Evaluating...</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} />
                              <span>Test Model</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Capabilities pills */}
                      {model.capabilities && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {model.capabilities.supports_text && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-wb-text-secondary)]">
                              <FileText size={10} className="text-[var(--color-wb-accent)]" />
                              Text Generation
                            </span>
                          )}
                          {model.capabilities.supports_code && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-wb-text-secondary)]">
                              <Code size={10} className="text-[var(--color-wb-accent)]" />
                              Code Synthesis
                            </span>
                          )}
                          {model.capabilities.supports_vision && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-wb-text-secondary)]">
                              <Eye size={10} className="text-[var(--color-wb-accent)]" />
                              Vision
                            </span>
                          )}
                          <span className="rounded-md bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-wb-text-muted)]">
                            {model.capabilities.max_context_tokens.toLocaleString()} tokens ctx
                          </span>
                        </div>
                      )}

                      {/* Path info */}
                      {model.health?.model_path && (
                        <div className="flex items-center gap-2 text-[11px] text-[var(--color-wb-text-muted)] border-t border-[var(--color-wb-border-subtle)] pt-2.5 font-mono">
                          <HardDrive size={12} className="text-[var(--color-wb-text-faint)]" />
                          <span className="truncate">{model.health.model_path}</span>
                        </div>
                      )}

                      {/* Test result output */}
                      {isCurrentResult && (
                        <div className="rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-bg)] p-3.5 space-y-2.5 animate-slide-up">
                          <div className="flex items-center justify-between text-[11px] text-[var(--color-wb-text-muted)]">
                            <span className="font-semibold text-[var(--color-wb-text)]">
                              Inference Response
                            </span>
                            <button
                              onClick={handleCopy}
                              className="inline-flex items-center gap-1 text-[10px] hover:text-[var(--color-wb-text)] transition-colors cursor-pointer"
                            >
                              {copied ? (
                                <Check size={11} className="text-[var(--color-wb-success)]" />
                              ) : (
                                <Copy size={11} />
                              )}
                              <span>{copied ? "Copied" : "Copy"}</span>
                            </button>
                          </div>

                          <p className="text-xs leading-relaxed text-[var(--color-wb-text-secondary)] whitespace-pre-wrap">
                            {testResult}
                          </p>

                          {testMeta && (
                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[var(--color-wb-text-muted)] border-t border-[var(--color-wb-border-subtle)] pt-2">
                              <span>Latency: <strong className="text-[var(--color-wb-text)]">{formatDuration(testMeta.duration)}</strong></span>
                              {testMeta.tokens !== null && (
                                <>
                                  <span>·</span>
                                  <span>Tokens: <strong className="text-[var(--color-wb-text)]">{testMeta.tokens}</strong></span>
                                </>
                              )}
                              {testMeta.fallback && (
                                <>
                                  <span>·</span>
                                  <span className="text-[var(--color-wb-warning)]">Fallback Provider</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
