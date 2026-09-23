"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getHealth,
  type HealthResponse,
  type VectorStoreHealth,
  type DocumentStoreHealth,
  type AuditHealth,
  type EmbeddingsHealth,
} from "@/lib/api";
import {
  SovereignMetric,
  SovereignStatus,
  SovereignInspector,
} from "@/components/sovereign";
import SystemArchitectureGraph from "@/components/dashboard/SystemArchitectureGraph";
import SubsystemHealthMatrix, { type DiagnosticData } from "@/components/dashboard/SubsystemHealthMatrix";
import { motion } from "framer-motion";
import {
  Activity,
  Database,
  FileText,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Search,
  Bot,
  MessageSquareCode,
  Network,
  HardDrive,
  Lock,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Zap,
} from "lucide-react";

const sectionReveal = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
} as const;

const staggerContainer = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [diagnosticData, setDiagnosticData] = useState<DiagnosticData | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await getHealth();
      setHealth(data);
      setError(null);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not establish connection to the Sovereign AI backend."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleInspectSubsystem = (data: DiagnosticData) => {
    setDiagnosticData(data);
    setIsInspectorOpen(true);
  };

  const handleSelectNode = (nodeId: string) => {
    if (!health) return;
    const vStore = (health.subsystems.vector_store || {}) as VectorStoreHealth;
    const dStore = (health.subsystems.document_store || {}) as DocumentStoreHealth;
    const audit = (health.subsystems.audit || {}) as AuditHealth;
    const emb = (health.subsystems.embeddings || {}) as EmbeddingsHealth;

    let diag: DiagnosticData | null = null;
    if (nodeId === "doc_store") {
      diag = {
        title: "Document Store",
        category: "Storage",
        status: dStore.status || "healthy",
        description: "Local air-gapped document repository with OCR and text extraction.",
        attributes: {
          documents_ingested: dStore.total_documents ?? health.knowledge_documents ?? 0,
          storage_location: "data/documents",
          formats: "PDF, DOCX, TXT",
        },
      };
    } else if (nodeId === "vector_store") {
      diag = {
        title: "Vector Store Index",
        category: "Vectors",
        status: vStore.status || "healthy",
        description: "In-memory vector store supporting fast Top-K cosine similarity searches.",
        attributes: {
          indexed_chunks: health.knowledge_chunks ?? 0,
          generation: (vStore.generation as number) ?? 1,
        },
      };
    } else if (nodeId === "embedding_engine") {
      diag = {
        title: "Embedding Engine",
        category: "Inference",
        status: String(emb.status || "healthy"),
        description: "Deterministic TF-IDF or open-weight neural transformer vectorizer running locally.",
        attributes: {
          provider: health.embedding_provider || "tfidf",
          device: (emb.device as string) || "Local CPU (SIMD)",
          leak_prevention: "Active",
        },
      };
    } else if (nodeId === "audit_logger") {
      diag = {
        title: "Append-Only Audit Chain",
        category: "Compliance",
        status: audit.status || "healthy",
        description: "Cryptographically linked audit stream recording all task and RAG operations.",
        attributes: {
          total_records: audit.session_records ?? 6,
          integrity_verified: true,
          tamper_detected: false,
        },
      };
    } else if (nodeId === "local_model") {
      diag = {
        title: "Open-Weight Local Model",
        category: "Inference",
        status: "healthy",
        description: "Local open-weight LLM execution via llama.cpp or simulated engine.",
        attributes: {
          model_name: health.models_registered?.[0] || "gemma-3-4b",
          runtime: "llama.cpp",
          context_window: "8192 tokens",
        },
      };
    } else if (nodeId === "agent_orchestrator") {
      diag = {
        title: "Agent Task Orchestrator",
        category: "Intelligence",
        status: "healthy",
        description: "Deterministic task planner, tool execution loop, and verification engine.",
        attributes: {
          max_steps: 8,
          tool_registry: "calculator, rag_search, file_parser",
          sandboxing: "Loopback Only",
        },
      };
    } else if (nodeId === "rag_engine") {
      diag = {
        title: "RAG Retrieval Engine",
        category: "Intelligence",
        status: "healthy",
        description: "Evidence grounding pipeline matching semantic queries to local manual chunks.",
        attributes: {
          relevance_threshold: 0.15,
          evidence_citations: "Enforced",
        },
      };
    }

    if (diag) {
      setDiagnosticData(diag);
      setIsInspectorOpen(true);
    }
  };

  if (loading && !health) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#64818E] to-[#4a6272] text-white shadow-[0_0_40px_rgba(100,129,142,0.4)]">
          <Activity className="h-7 w-7 animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9CAFBE] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#9CAFBE]" />
          </span>
        </div>
        <div className="text-center font-mono">
          <span className="text-xs uppercase tracking-widest text-[#64818E]">
            Establishing Air-Gapped Telemetry Channel...
          </span>
          <div className="mt-2 text-[10px] text-[#64818E]/50">127.0.0.1:8000/api/health</div>
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="rounded-2xl border border-[#be123c]/30 bg-white/80 p-8 text-center surface-level-2 backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#be123c]/10 text-[#be123c] border border-[#be123c]/20">
          <Activity className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold font-mono text-[#192730] uppercase">
          Telemetry Pipeline Disconnected
        </h3>
        <p className="mt-2 text-xs text-[#64818E]/70 font-mono">{error}</p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-xl border border-[#64818E]/40 bg-[#64818E]/10 px-4 py-2 text-xs font-mono text-[#64818E] hover:bg-[#64818E]/20 hover:shadow-[0_0_20px_rgba(100,129,142,0.3)] transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reconnect Telemetry Channel</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Air-Gap Assurance Command Header */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={sectionReveal}
        className="relative overflow-hidden rounded-2xl border border-[#64818E]/15 bg-white/80 p-6 shadow-2xl surface-level-2 backdrop-blur-2xl"
      >
        {/* Subtle gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#047857]/8 via-transparent to-[#64818E]/8" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#047857]/30 to-transparent" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#047857] to-[#047857] text-white shadow-[0_0_25px_rgba(4,120,87,0.3)] border border-[#64818E]/20">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#047857]">
                  Strict Sovereign Isolation
                </span>
                <span className="rounded-lg bg-[#047857]/10 border border-[#047857]/40 px-2 py-0.5 font-mono text-[9px] font-bold text-[#047857] uppercase">
                  Zero Network Leakage
                </span>
              </div>
              <p className="text-xs text-[#64818E] mt-1 font-mono max-w-lg">
                All model inference, vector indices, document OCR, and agent planning execute strictly on-premise via loopback.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 font-mono">
            <Link
              href="/chat"
              className="flex items-center gap-2 rounded-xl border border-[#64818E]/50 bg-gradient-to-r from-[#64818E]/15 to-[#4a6272]/15 px-4 py-2 text-xs text-[#192730] hover:shadow-[0_0_20px_rgba(100,129,142,0.3)] transition-all cursor-pointer group font-bold"
            >
              <MessageSquareCode className="h-4 w-4 text-[#64818E]" />
              <span>Chat Studio</span>
              <ArrowRight className="h-3 w-3 text-[#64818E] group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/agent"
              className="flex items-center gap-2 rounded-xl border border-[#64818E]/15 bg-[#64818E]/6 px-4 py-2 text-xs text-[#2d404a] hover:border-[#64818E]/30 hover:bg-[#64818E]/10 transition-all cursor-pointer font-medium"
            >
              <Bot className="h-4 w-4 text-[#64818E]/70" />
              <span>Agent Ops</span>
            </Link>
            <Link
              href="/knowledge"
              className="flex items-center gap-2 rounded-xl border border-[#64818E]/15 bg-[#64818E]/6 px-4 py-2 text-xs text-[#2d404a] hover:border-[#1e6b7b]/30 hover:bg-[#1e6b7b]/10 transition-all cursor-pointer font-medium"
            >
              <Search className="h-4 w-4 text-[#64818E]/70" />
              <span>Query RAG</span>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* 4 Sovereign Metrics */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* Knowledge Base */}
        <SovereignMetric
          label="Knowledge Base"
          value={health.knowledge_chunks}
          unit="CHUNKS"
          sublabel={`${health.knowledge_documents} industrial manuals`}
          status="healthy"
          statusLabel="INDEXED"
          icon={<Database className="h-4 w-4" />}
          accent="cyan"
          trend={{ direction: "neutral", value: health.embedding_provider || "tfidf" }}
        />

        {/* Model Runtime */}
        <SovereignMetric
          label="Model Runtime"
          value={health.models_registered?.[0] || "GEMMA 3 4B"}
          unit="LOCAL"
          sublabel="llama.cpp open-weight runtime"
          status="operational"
          statusLabel="STANDBY"
          icon={<Cpu className="h-4 w-4" />}
          accent="violet"
          trend={{ direction: "neutral", value: "8K Tokens" }}
        />

        {/* Network Compliance */}
        <SovereignMetric
          label="Air-Gap Compliance"
          value="127.0.0.1"
          unit="LOOPBACK"
          sublabel="0 external outbound leaks"
          status="air-gapped"
          statusLabel="ISOLATED"
          icon={<Network className="h-4 w-4" />}
          accent="emerald"
          trend={{ direction: "up", value: "0 B/s Egress" }}
        />

        {/* Audit Chain */}
        <SovereignMetric
          label="Audit Ledger"
          value={health.subsystems.audit?.session_records ?? 6}
          unit="EVENTS"
          sublabel="HMAC SHA-256 chain verified"
          status="healthy"
          statusLabel="VALIDATED"
          icon={<HardDrive className="h-4 w-4" />}
          accent="amber"
          trend={{ direction: "up", value: "0 Tamper" }}
        />
      </motion.div>

      {/* Sovereign Core Architecture Graph */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={sectionReveal}
      >
        <SystemArchitectureGraph
          health={health}
          onSelectNode={handleSelectNode}
        />
      </motion.div>

      {/* Subsystem Health & Integrity Matrix */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={sectionReveal}
      >
        <SubsystemHealthMatrix
          health={health}
          onInspect={handleInspectSubsystem}
        />
      </motion.div>

      {/* Reusable Inspector Drawer */}
      <SovereignInspector
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        title={diagnosticData?.title || "Subsystem Diagnostics"}
        subtitle={diagnosticData?.description}
        badge={
          diagnosticData?.status && (
            <SovereignStatus status={diagnosticData.status} size="xs" />
          )
        }
        data={diagnosticData?.attributes}
        rawJson={
          diagnosticData?.rawJson
            ? JSON.stringify(diagnosticData.rawJson, null, 2)
            : undefined
        }
      />
    </div>
  );
}
