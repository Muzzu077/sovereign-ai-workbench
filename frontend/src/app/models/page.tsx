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
  Layers3,
  RefreshCw,
  Loader2,
  Cpu,
  Globe,
  Zap,
  Play,
  Copy,
  Check,
} from "lucide-react";

interface ModelRow extends ModelInfo {
  health?: ModelHealthInfo;
}

const PRESETS = [
  "Explain what a sovereign AI workbench is in one sentence.",
  "What are the best practices for air-gapped LLM deployment?",
  "Write a Python function to parse JSON safely.",
];

function EmptyState({ icon: Icon, title, description }: { icon: typeof Layers3; title: string; description: string }) {
  return (
    <div className="flex min-h-[310px] flex-col items-center justify-center border border-dashed border-border bg-panel/35 px-6 py-10 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-md border border-border bg-panel text-primary">
        <Icon className="size-5" strokeWidth={1.6} />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

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
      if (!testPrompt.trim() || testLoading) return;
      setTestLoading(true);
      setTestModel(modelName);
      setTestResult(null);
      setTestMeta(null);
      try {
        const res = await testModelInference({
          model_name: modelName,
          prompt: testPrompt,
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
        setTestResult(`Error: ${err instanceof Error ? err.message : "Inference failed"}`);
      } finally {
        setTestLoading(false);
      }
    },
    [testPrompt, testLoading],
  );

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const selectedModelData = testModel ? models.find((m) => m.name === testModel) || models[0] : models[0];

  return (
    <AppShell>
      <main className="mx-auto max-w-[1420px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
              <Layers3 className="size-3.5" /> INFERENCE / 04
            </div>
            <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl text-foreground">
              Model registry
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Inspect locally registered open-weight models and their capabilities.
            </p>
          </div>

          <button
            onClick={fetchModels}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-panel text-xs text-muted-foreground hover:text-foreground hover:bg-panel-hover transition-colors"
            title="Refresh models"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Status Line */}
        <div className="mb-7 flex items-center gap-2 border-y border-border py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          LOCAL RUNTIME CONNECTED
          <span className="mx-2 text-faint">/</span>
          {models.length} REGISTERED MODEL{models.length === 1 ? "" : "S"}
          <span className="mx-2 text-faint">/</span>
          NO EXTERNAL CALLS
        </div>

        {/* Test Prompt Input Bar */}
        <div className="mb-6 space-y-2">
          <div className="flex gap-2">
            <input
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Enter prompt for model evaluation..."
              className="h-10 flex-1 rounded border border-border bg-panel px-3.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
            <span className="text-muted-foreground">PRESETS:</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setTestPrompt(p)}
                className="text-muted-foreground hover:text-foreground underline truncate max-w-xs"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Main Grid: Models List vs Details Aside (matches reference) */}
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          {/* Left Column: Registered Models List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Registered models</span>
              <span className="font-mono text-[10px] text-muted-foreground">{models.length} CONNECTED</span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center border border-border bg-panel/35 py-16 text-xs text-muted-foreground gap-2">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span>Loading model profiles...</span>
              </div>
            ) : models.length === 0 ? (
              <EmptyState
                icon={Layers3}
                title="No local runtime connected"
                description="Model names, quantization, modalities, and hardware requirements will appear when a local model registry is connected."
              />
            ) : (
              <div className="border border-border divide-y divide-border bg-panel/30">
                {models.map((model) => {
                  const isTestingThis = testLoading && testModel === model.name;
                  const isCurrentResult = testModel === model.name && testResult;

                  return (
                    <div
                      key={model.name}
                      onClick={() => setTestModel(model.name)}
                      className={cn(
                        "p-5 space-y-3 cursor-pointer transition-colors",
                        testModel === model.name ? "bg-accent/40" : "hover:bg-panel-hover",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="grid size-9 place-items-center rounded border border-border bg-panel text-primary">
                            {model.local ? <Zap className="size-4" /> : <Globe className="size-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {model.name === "general" ? "Gemma 3 4B (General)" : model.name}
                              </span>
                              {model.local && (
                                <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                  LOCAL
                                </span>
                              )}
                            </div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground flex flex-wrap items-center gap-2">
                              <span>Provider: {model.provider_name}</span>
                              <span>·</span>
                              <span>Context: {model.capabilities?.max_context_tokens?.toLocaleString() || 8192} tokens</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTest(model.name);
                          }}
                          disabled={isTestingThis}
                          className="px-3 py-1.5 rounded border border-border bg-panel text-xs font-semibold hover:border-primary/50 text-foreground transition-colors flex items-center gap-1.5"
                        >
                          {isTestingThis ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              <span>Evaluating...</span>
                            </>
                          ) : (
                            <>
                              <Play className="size-3 fill-current" />
                              <span>Test Inference</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Display test result if this model was tested */}
                      {isCurrentResult && (
                        <div className="mt-3 border border-border p-3.5 bg-background rounded text-xs space-y-2">
                          <div className="flex items-center justify-between font-mono text-[10px] text-primary">
                            <span>
                              RESULT · {testMeta?.duration ? formatDuration(testMeta.duration) : ""} · {testMeta?.tokens ?? "?"} TOKENS
                            </span>
                            <button
                              onClick={() => testResult && handleCopy(testResult)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {copied ? <Check className="size-3 text-primary inline" /> : <Copy className="size-3 inline" />}
                            </button>
                          </div>
                          <p className="leading-relaxed text-foreground whitespace-pre-wrap font-mono text-xs">
                            {testResult}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Model Information Aside (matches reference) */}
          <div className="border border-border bg-panel p-5 space-y-4">
            <div className="font-mono text-[10px] uppercase text-muted-foreground">
              MODEL INFORMATION
            </div>
            <div className="space-y-4 pt-1">
              {[
                { label: "Selected", value: selectedModelData?.name || "gemma-3-4b" },
                { label: "Provider", value: selectedModelData?.provider_name || "llama.cpp (Local)" },
                { label: "Parameters", value: "4 Billion" },
                { label: "Quantization", value: "Q4_K_M" },
                { label: "VRAM estimate", value: "3.2 GB" },
                { label: "Modalities", value: "Text · Embeddings" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between border-b border-border pb-3 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
