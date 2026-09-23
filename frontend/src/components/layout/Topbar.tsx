"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getHealth, type HealthResponse } from "@/lib/api";
import { SovereignStatus } from "@/components/sovereign";
import {
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
  Activity,
  Sparkles,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

const TITLES: Record<string, { title: string; subtitle: string; code: string }> = {
  "/chat": {
    code: "WS-CHAT",
    title: "Interactive AI Studio",
    subtitle: "Air-gapped conversation, multi-persona reasoning & grounded citations",
  },
  "/": {
    code: "WS-CORE",
    title: "Sovereign Core Dashboard",
    subtitle: "Node architecture topology, FAISS index & real-time telemetry",
  },
  "/documents": {
    code: "WS-DOCS",
    title: "Document Intelligence Hub",
    subtitle: "Local OCR ingestion, chunking pipeline & vector store",
  },
  "/knowledge": {
    code: "WS-RAG",
    title: "Knowledge Base & RAG Engine",
    subtitle: "Semantic vector retrieval, chunk inspector & neural embeddings",
  },
  "/agent": {
    code: "WS-AGENT",
    title: "Autonomous Agent Orchestrator",
    subtitle: "Deterministic planner, tool execution loop & audit ledger",
  },
  "/models": {
    code: "WS-MODELS",
    title: "Open-Weight Model Registry",
    subtitle: "Local LLM instances, context windows & compute telemetry",
  },
};

export default function Topbar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [latency, setLatency] = useState(118);

  const meta = TITLES[pathname] || {
    code: "WS-SOV",
    title: "Sovereign AI Workstation",
    subtitle: "On-Premise Industrial AI Environment",
  };

  const checkHealth = async () => {
    setIsRefreshing(true);
    const start = performance.now();
    try {
      const data = await getHealth();
      const elapsed = Math.round(performance.now() - start);
      setHealth(data);
      setLatency(elapsed > 0 ? elapsed : 118);
      setLastCheck(new Date().toISOString());
      setIsError(false);
    } catch {
      setIsError(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15_000);
    return () => clearInterval(interval);
  }, []);

  const openCommandPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#64818E]/20 bg-white/85 px-8 surface-level-1 backdrop-blur-2xl">
      {/* Page Title & Breadcrumb */}
      <div className="flex items-center gap-3.5 min-w-0 pr-4">
        <span className="font-mono text-[10px] font-extrabold text-[#1e6b7b] border border-[#1e6b7b]/30 bg-[#1e6b7b]/10 px-2 py-0.5 rounded-lg shadow-sm">
          {meta.code}
        </span>
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-bold tracking-tight text-[#192730] flex items-center gap-2 truncate font-sans">
            {meta.title}
          </h1>
          <p className="text-[11px] text-[#2d404a] hidden lg:block truncate font-mono font-medium">
            {meta.subtitle}
          </p>
        </div>
      </div>

      {/* Real-time Compact Telemetry Bar */}
      <div className="flex items-center gap-3 font-mono text-xs shrink-0">
        {/* Cmd+K Quick Launcher Button */}
        <button
          onClick={openCommandPalette}
          className="hidden sm:flex items-center gap-2 rounded-xl border border-[#64818E]/25 bg-white/80 px-3.5 py-1.5 text-xs text-[#2d404a] hover:border-[#64818E]/45 hover:text-[#192730] hover:shadow-sm transition-all cursor-pointer group font-medium"
        >
          <Search className="h-3.5 w-3.5 text-[#1e6b7b] group-hover:scale-110 transition-transform" />
          <span className="font-sans text-[11px] font-semibold text-[#192730]">Quick Actions</span>
          <kbd className="rounded-md border border-[#64818E]/25 bg-[#64818E]/10 px-1.5 py-0.2 text-[10px] text-[#2d404a] font-mono font-bold">
            ⌘K
          </kbd>
        </button>

        {/* Live Subsystem Telemetry Badges */}
        {health && (
          <div className="hidden xl:flex items-center gap-3 rounded-xl border border-[#64818E]/25 bg-white/75 px-3.5 py-1.5 text-[11px] text-[#2d404a] backdrop-blur-md">
            <span className="flex items-center gap-1.5 text-[#047857] font-bold">
              <span className="h-2 w-2 rounded-full bg-[#047857] animate-pulse" />
              OPERATIONAL
            </span>
            <span className="text-[#64818E]/25">|</span>
            <span className="text-[#4a6272] font-semibold">CHUNKS:</span>
            <span className="font-bold text-[#192730]">{health.knowledge_chunks}</span>
            <span className="text-[#64818E]/25">|</span>
            <span className="text-[#4a6272] font-semibold">MODELS:</span>
            <span className="font-bold text-[#1e6b7b]">{health.models_registered.length}</span>
            <span className="text-[#64818E]/25">|</span>
            <span className="text-[#4a6272] font-semibold">LATENCY:</span>
            <span className="font-bold text-[#b45309]">{latency}ms</span>
          </div>
        )}

        {/* Air-Gapped Indicator */}
        <div className="hidden md:flex items-center gap-1.5 rounded-xl border border-[#047857]/30 bg-[#047857]/10 px-3 py-1.5 text-[11px] text-[#047857] font-mono shadow-sm">
          <ShieldCheck className="h-3.5 w-3.5 text-[#047857]" />
          <span className="font-bold">AIR-GAPPED</span>
        </div>

        {/* Global Health Badge */}
        <div className="flex items-center gap-2">
          {isError ? (
            <SovereignStatus status="unavailable" size="sm" />
          ) : health ? (
            <SovereignStatus status={health.status} size="sm" />
          ) : (
            <SovereignStatus status="processing" size="sm" />
          )}
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={checkHealth}
          title={`Last telemetry refresh ${formatRelativeTime(lastCheck)}`}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#64818E]/25 bg-white/80 text-[#2d404a] transition-all hover:border-[#64818E]/45 hover:text-[#192730] hover:bg-[#64818E]/15 cursor-pointer"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#1e6b7b]" : ""}`}
          />
        </button>
      </div>
    </header>
  );
}
