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
  Sliders,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BackgroundGrid } from "@/components/ui/BackgroundGrid";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

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
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize tracking-wide font-mono",
          isAvail
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            : "bg-amber-500/10 text-amber-400 border border-amber-500/30",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isAvail ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" : "bg-amber-400",
          )}
        />
        {status}
      </span>
    );
  };

  return (
    <AppShell>
      <div className="relative flex-1 overflow-y-auto px-8 py-8 bg-[#070a12]">
        <BackgroundGrid variant="dots" opacity={0.04} />
        <div className="relative z-10 mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu size={18} className="text-cyan-400" />
                <span>Local Models & Inference Engine</span>
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Manage registered models running on local hardware (llama.cpp / GPU / Apple Silicon).
              </p>
            </div>
            <ShimmerButton
              onClick={fetchModels}
              loading={loading}
              variant="secondary"
              size="sm"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin-smooth")} />
              <span>Refresh Models</span>
            </ShimmerButton>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300">
              <XCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Test prompt composer */}
          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 shadow-lg backdrop-blur-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-white flex items-center gap-2">
                <Sliders size={14} className="text-cyan-400" />
                <span>Live Test Inference Prompt</span>
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">
                Executed against target model
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Enter prompt for model evaluation..."
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
              />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">Presets:</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTestPrompt(preset)}
                  className="rounded-xl border border-white/10 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-500/30 hover:bg-slate-700/80 hover:text-white transition-all cursor-pointer truncate max-w-[280px]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Models list */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Registered Model Providers ({models.length})
            </h2>

            {loading && models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-400 gap-2">
                <Loader2 size={20} className="animate-spin-smooth text-cyan-400" />
                <span>Loading model profiles...</span>
              </div>
            ) : models.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-12 text-center bg-slate-900/40">
                <Box size={24} className="mb-2 text-slate-500 opacity-60" />
                <span className="text-xs font-bold text-white">
                  No models registered
                </span>
                <p className="mt-1 text-[11px] text-slate-400">
                  Check backend configuration in app/config.py
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {models.map((model) => {
                  const isTestingThis = testLoading && testModel === model.name;
                  const isCurrentResult = testModel === model.name && testResult;

                  return (
                    <SpotlightCard
                      key={model.name}
                      className="p-5 space-y-4"
                      spotlightColor="rgba(6, 182, 212, 0.12)"
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)] shrink-0">
                            {model.local ? (
                              <Zap size={18} />
                            ) : (
                              <Globe size={18} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2.5">
                              <h3 className="text-sm font-bold text-white">
                                {model.name === "general" ? "Gemma 3 4B (General)" : model.name}
                              </h3>
                              {model.health && statusBadge(model.health.status)}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                              <span>Provider: <strong className="text-slate-200 font-semibold">{model.provider_name}</strong></span>
                              <span>·</span>
                              <span className="capitalize">{model.provider_type}</span>
                              {model.local && (
                                <>
                                  <span>·</span>
                                  <span className="text-emerald-400 font-bold">100% Local Hardware</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <ShimmerButton
                          onClick={() => handleTest(model.name)}
                          loading={isTestingThis}
                          variant="primary"
                          size="sm"
                        >
                          <Send size={12} />
                          <span>Test Model</span>
                        </ShimmerButton>
                      </div>

                      {/* Capabilities pills */}
                      {model.capabilities && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {model.capabilities.supports_text && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-200">
                              <FileText size={11} className="text-cyan-400" />
                              Text Generation
                            </span>
                          )}
                          {model.capabilities.supports_code && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-200">
                              <Code size={11} className="text-teal-400" />
                              Code Synthesis
                            </span>
                          )}
                          {model.capabilities.supports_vision && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-200">
                              <Eye size={11} className="text-indigo-400" />
                              Vision
                            </span>
                          )}
                          <span className="rounded-lg bg-slate-800/80 border border-white/10 px-2.5 py-1 font-mono text-[10px] text-slate-400">
                            {model.capabilities.max_context_tokens.toLocaleString()} ctx tokens
                          </span>
                        </div>
                      )}

                      {/* Path info */}
                      {model.health?.model_path && (
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 border-t border-white/[0.06] pt-3 font-mono">
                          <HardDrive size={12} className="text-cyan-400" />
                          <span className="truncate">{model.health.model_path}</span>
                        </div>
                      )}

                      {/* Test result output */}
                      {isCurrentResult && (
                        <div className="rounded-xl border border-cyan-500/30 bg-slate-950/80 p-4 space-y-3 animate-slide-up shadow-inner">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-bold text-white flex items-center gap-1.5">
                              <Sparkles size={13} className="text-cyan-400" />
                              <span>Inference Response</span>
                            </span>
                            <button
                              onClick={handleCopy}
                              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                            >
                              {copied ? (
                                <Check size={12} className="text-emerald-400" />
                              ) : (
                                <Copy size={12} />
                              )}
                              <span>{copied ? "Copied" : "Copy Output"}</span>
                            </button>
                          </div>

                          <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-mono">
                            {testResult}
                          </p>

                          {testMeta && (
                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-400 border-t border-white/[0.08] pt-2.5">
                              <span>Latency: <strong className="text-cyan-300">{formatDuration(testMeta.duration)}</strong></span>
                              {testMeta.tokens !== null && (
                                <>
                                  <span>·</span>
                                  <span>Tokens: <strong className="text-slate-200">{testMeta.tokens}</strong></span>
                                </>
                              )}
                              {testMeta.fallback && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-400 font-bold">Fallback Provider</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </SpotlightCard>
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
