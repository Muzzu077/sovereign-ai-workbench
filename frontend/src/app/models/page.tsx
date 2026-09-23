"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Cpu,
  Zap,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Play,
  Sliders,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  ArrowRight,
  Code2,
  Eye,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SovereignPanel,
  SovereignModelCard,
  SovereignStatus,
  SovereignInspector,
} from "@/components/sovereign";
import {
  listModels,
  getHealth,
  testModelInference,
  type ModelInfo,
  type HealthResponse,
} from "@/lib/api";

const sectionReveal = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
} as const;

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [testPrompt, setTestPrompt] = useState("Explain the concept of local air-gapped sovereign AI.");
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [isInferring, setIsInferring] = useState(false);
  const [selectedInspectModel, setSelectedInspectModel] = useState<ModelInfo | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const fetchModelData = useCallback(async () => {
    try {
      setLoading(true);
      const [m, h] = await Promise.all([listModels(), getHealth()]);
      setModels(m);
      setHealth(h);
      if (m.length > 0 && !selectedModel) {
        setSelectedModel(m[0]);
      }
    } catch (err) {
      console.error("Failed to load model registry", err);
    } finally {
      setLoading(false);
    }
  }, [selectedModel]);

  useEffect(() => {
    fetchModelData();
  }, [fetchModelData]);

  const handleTestInference = async () => {
    if (!testPrompt.trim() || isInferring) return;
    setIsInferring(true);
    setTestOutput(null);

    try {
      const res = await testModelInference({
        prompt: testPrompt.trim(),
        model_name: selectedModel?.name || "general",
      });

      const fallbackNotice = res.fallback_used
        ? `\n[Notice: External llama-server is offline. Prompt was synthesized by Sovereign Deterministic Reasoning Engine.]\n`
        : "";

      setTestOutput(
        `[Model: ${res.model_name}] [Provider: ${res.provider}] [Latency: ${res.duration_ms}ms] [Tokens: ${res.tokens_used ?? "N/A"}]${fallbackNotice}\n${res.text}`
      );
    } catch (err) {
      setTestOutput(
        `Inference execution failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsInferring(false);
    }
  };

  const handleInspectModel = (m: ModelInfo) => {
    setSelectedInspectModel(m);
    setIsInspectorOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#64818E]/18 bg-white/80 p-5 shadow-2xl surface-level-2 backdrop-blur-2xl"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#be123c] to-[#9f1239] text-[#192730] shadow-[0_0_25px_rgba(190,18,60,0.3)] border border-[#64818E]/25">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#192730]">
                Open-Weight Model Registry
              </h1>
              <span className="rounded-lg bg-[#be123c]/10 border border-[#be123c]/40 px-2 py-0.5 font-mono text-[9px] font-bold text-[#be123c] uppercase">
                llama.cpp Runtime
              </span>
            </div>
            <p className="text-[11px] text-[#2d404a] mt-0.5 font-mono font-medium">
              Local LLM instances, context windows, hardware acceleration, and quantization status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] text-[#2d404a]">
          <button
            onClick={fetchModelData}
            className="flex items-center gap-2 rounded-xl border border-[#64818E]/30 bg-white/80 px-3.5 py-2 text-xs text-[#2d404a] hover:border-[#64818E]/50 hover:bg-[#64818E]/15 transition-all cursor-pointer font-mono font-bold shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-[#1e6b7b]" : "text-[#1e6b7b]"}`} />
            <span>Refresh Registry</span>
          </button>
        </div>
      </motion.div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {models.map((m) => {
          const isSelected = selectedModel?.name === m.name;

          return (
            <SovereignModelCard
              key={m.name}
              name={m.name}
              runtime={m.provider_name || "llama.cpp"}
              contextTokens={m.capabilities?.max_context_tokens || 8192}
              quantization="Q4_K_M (4-bit)"
              acceleration="CPU / SIMD"
              status={m.available !== false ? "operational" : "standby"}
              tags={["TEXT GEN", "RAG REASONING", "TOOL CALLING"]}
              selected={isSelected}
              onSelect={() => setSelectedModel(m)}
              onInspect={() => handleInspectModel(m)}
            />
          );
        })}
      </div>

      {/* Local Inference Test Console */}
      <SovereignPanel
        title="Local Model Inference Playground"
        subtitle={`Selected: ${selectedModel?.name || "gemma-3-4b"}`}
        badge={<SovereignStatus status="operational" label="AIR-GAPPED" size="xs" />}
        elevation={2}
      >
        <div className="space-y-3 font-mono">
          <textarea
            rows={2}
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Enter test prompt for on-premise inference..."
            className="w-full rounded-xl border border-[#64818E]/30 bg-white/95 p-3.5 text-xs text-[#192730] placeholder:text-[#4a6272] focus:border-[#1e6b7b] focus:outline-none focus:ring-1 focus:ring-[#1e6b7b] transition-all font-sans"
          />

          <div className="flex justify-end">
            <button
              onClick={handleTestInference}
              disabled={isInferring || !testPrompt.trim()}
              className="flex items-center gap-2 rounded-xl border border-[#1e6b7b]/40 bg-[#1e6b7b]/10 px-5 py-2 text-xs font-mono font-bold text-[#1e6b7b] hover:bg-[#1e6b7b]/20 hover:border-[#1e6b7b]/60 transition-all cursor-pointer disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{isInferring ? "Generating..." : "Execute Inference"}</span>
            </button>
          </div>

          <AnimatePresence>
            {testOutput && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="rounded-2xl border border-[#64818E]/30 bg-white/95 p-4 text-xs text-[#192730] whitespace-pre-wrap font-mono shadow-sm"
              >
                {testOutput}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SovereignPanel>

      {/* Model Diagnostic Inspector Drawer */}
      <SovereignInspector
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        title={selectedInspectModel?.name || "Model Telemetry"}
        subtitle="Open-weight model running locally on-premise without cloud API dependencies"
        badge={
          selectedInspectModel?.available !== false ? (
            <SovereignStatus status="operational" size="xs" />
          ) : (
            <SovereignStatus status="standby" size="xs" />
          )
        }
        data={{
          model_name: selectedInspectModel?.name || "",
          provider_name: selectedInspectModel?.provider_name || "llama.cpp",
          provider_type: selectedInspectModel?.provider_type || "local",
          max_context_tokens: selectedInspectModel?.capabilities?.max_context_tokens || 8192,
          supports_code: selectedInspectModel?.capabilities?.supports_code ? "Yes" : "No",
          supports_vision: selectedInspectModel?.capabilities?.supports_vision ? "Yes" : "No",
          isolation: "Strict Loopback",
        }}
        rawJson={selectedInspectModel ? JSON.stringify(selectedInspectModel, null, 2) : undefined}
      />
    </div>
  );
}
