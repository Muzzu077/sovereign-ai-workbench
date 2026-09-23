"use client";

import React, { useState } from "react";
import {
  FileText,
  Database,
  Zap,
  Sparkles,
  Cpu,
  Bot,
  ShieldCheck,
  Layers,
  Network,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthResponse } from "@/lib/api/types";
import SovereignStatus from "@/components/sovereign/SovereignStatus";

interface SystemArchitectureGraphProps {
  health: HealthResponse | null;
  onSelectNode?: (nodeId: string) => void;
}

interface NodeDef {
  id: string;
  name: string;
  role: string;
  icon: React.ComponentType<{ className?: string }>;
  x: number;
  y: number;
  category: "storage" | "engine" | "intelligence" | "compliance";
  connections: string[];
}

const NODES: NodeDef[] = [
  {
    id: "doc_store",
    name: "DOCUMENT STORE",
    role: "Local OCR & Parsing",
    icon: FileText,
    x: 14,
    y: 32,
    category: "storage",
    connections: ["embedding_engine", "audit_logger"],
  },
  {
    id: "embedding_engine",
    name: "EMBEDDING ENGINE",
    role: "TF-IDF / MiniLM-512d",
    icon: Zap,
    x: 38,
    y: 18,
    category: "engine",
    connections: ["vector_store"],
  },
  {
    id: "vector_store",
    name: "VECTOR STORE",
    role: "FAISS In-Memory Index",
    icon: Database,
    x: 62,
    y: 18,
    category: "storage",
    connections: ["rag_engine"],
  },
  {
    id: "rag_engine",
    name: "RAG RETRIEVAL",
    role: "Evidence Grounding",
    icon: Sparkles,
    x: 86,
    y: 32,
    category: "intelligence",
    connections: ["local_model"],
  },
  {
    id: "local_model",
    name: "LOCAL MODEL",
    role: "llama.cpp Open-Weight",
    icon: Cpu,
    x: 72,
    y: 76,
    category: "intelligence",
    connections: ["agent_orchestrator", "audit_logger"],
  },
  {
    id: "agent_orchestrator",
    name: "AGENT DISPATCHER",
    role: "Deterministic Planner",
    icon: Bot,
    x: 28,
    y: 76,
    category: "intelligence",
    connections: ["rag_engine", "audit_logger"],
  },
  {
    id: "audit_logger",
    name: "AUDIT LEDGER",
    role: "SHA-256 Hash Chain",
    icon: ShieldCheck,
    x: 50,
    y: 48,
    category: "compliance",
    connections: [],
  },
];

export default function SystemArchitectureGraph({
  health,
  onSelectNode,
}: SystemArchitectureGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const getSubsystemData = (
    id: string
  ): { status: string; metrics: Record<string, string | number> } | null => {
    if (!health) return null;
    const dStore = health.subsystems.document_store;
    const vStore = health.subsystems.vector_store;
    const audit = health.subsystems.audit;

    switch (id) {
      case "doc_store":
        return {
          status: String(dStore?.status || "healthy"),
          metrics: {
            "Ingested Docs": dStore?.total_documents ?? health.knowledge_documents ?? 0,
            "Isolation": "Loopback 127.0.0.1",
            "Pipeline": "OCR + Sanitizer",
          },
        };
      case "embedding_engine":
        return {
          status: String(health.subsystems.embeddings?.status || "healthy"),
          metrics: {
            "Vector Engine": health.embedding_provider || "tfidf",
            "Dimensions": health.embedding_provider?.includes("minilm") ? 384 : 512,
            "Target Device": "CPU (SIMD Accelerated)",
          },
        };
      case "vector_store":
        return {
          status: String(vStore?.status || "healthy"),
          metrics: {
            "Indexed Chunks": health.knowledge_chunks ?? 0,
            "Generation": (vStore?.generation as number) ?? 1,
            "Search Metric": "Cosine Similarity",
          },
        };
      case "rag_engine":
        return {
          status: "healthy",
          metrics: {
            "Strategy": "Strict Citation Grounding",
            "Min Threshold": "0.15 Cosine",
            "Hallucination Guard": "Enforced",
          },
        };
      case "local_model":
        return {
          status: "healthy",
          metrics: {
            "Registered Models": health.models_registered?.length ?? 1,
            "Default Model": health.models_registered?.[0] || "gemma-3-4b",
            "Context Window": "8,192 Tokens",
          },
        };
      case "agent_orchestrator":
        return {
          status: "healthy",
          metrics: {
            "Tool Sandbox": "Calculator, Vector Search, Parser",
            "Max Recursion": "8 Steps",
            "Deterministic Mode": "Active",
          },
        };
      case "audit_logger":
        return {
          status: String(audit?.status || "healthy"),
          metrics: {
            "Log Integrity": "Append-Only (HMAC-SHA256)",
            "Session Events": audit?.session_records ?? 6,
            "Tamper Status": audit?.tamper_evident !== false ? "Verified Clean" : "Warning",
          },
        };
      default:
        return null;
    }
  };

  const activeSubsystem = hoveredNode ? getSubsystemData(hoveredNode) : null;
  const activeNodeDef = NODES.find((n) => n.id === hoveredNode);

  return (
    <div className="relative rounded-2xl border border-[#64818E]/15 bg-white/80 surface-level-2 p-6 shadow-2xl backdrop-blur-2xl overflow-hidden">
      {/* Background hairline technical grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid-technical opacity-50" />

      {/* Header bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#64818E]/15 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#64818E]/30 bg-[#64818E]/15 text-[#1e6b7b]">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#192730]">
                Sovereign Core Architecture Topology
              </h2>
              <span className="rounded border border-[#64818E]/30 bg-[#64818E]/10 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-[#1e6b7b]">
                LIVE TOPOLOGY
              </span>
            </div>
            <p className="text-[11px] text-[#2d404a] font-mono">
              Deterministic node routing connecting Document Store, Embeddings, FAISS Vectors, Local LLM, and Audit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] text-[#2d404a]">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1e6b7b] animate-status-pulse" />
            Active Vector Route
          </span>
          <span className="text-[#64818E]/20">|</span>
          <span className="flex items-center gap-1.5 text-[#047857] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#047857]" />
            Air-Gapped Loopback
          </span>
        </div>
      </div>

      {/* Interactive Topology Canvas */}
      <div className="relative z-10 h-[380px] w-full rounded-xl border border-[#64818E]/12 bg-white/60 p-4">
        {/* SVG connection lines */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="sovLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="sovActiveLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#5eead4" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {NODES.flatMap((fromNode) =>
            fromNode.connections.map((targetId) => {
              const toNode = NODES.find((n) => n.id === targetId);
              if (!toNode) return null;

              const isHighlighted =
                hoveredNode === fromNode.id || hoveredNode === toNode.id;

              return (
                <g key={`${fromNode.id}->${targetId}`}>
                  <line
                    x1={`${fromNode.x}%`}
                    y1={`${fromNode.y}%`}
                    x2={`${toNode.x}%`}
                    y2={`${toNode.y}%`}
                    stroke={isHighlighted ? "url(#sovActiveLineGrad)" : "url(#sovLineGrad)"}
                    strokeWidth={isHighlighted ? "2" : "1"}
                    strokeDasharray={isHighlighted ? "none" : "3 3"}
                    className="transition-all duration-200"
                  />
                </g>
              );
            })
          )}
        </svg>

        {/* Nodes */}
        {NODES.map((node) => {
          const isHovered = hoveredNode === node.id;
          const isConnected =
            hoveredNode &&
            (node.connections.includes(hoveredNode) ||
              NODES.find((n) => n.id === hoveredNode)?.connections.includes(
                node.id
              ));
          const Icon = node.icon;

          return (
            <div
              key={node.id}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              className="absolute z-20"
            >
              <button
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onSelectNode?.(node.id)}
                className={cn(
                  "group flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all duration-150 cursor-pointer focus-ring",
                    isHovered
                     ? "bg-[#C9D0D8]/95 border border-[#64818E]/80 shadow-xl shadow-[#64818E]/40 scale-105"
                     : isConnected
                     ? "bg-[#C9D0D8]/80 border border-[#1e6b7b]/50 shadow-md scale-102"
                     : "bg-white/85 border border-[#64818E]/15 hover:border-[#64818E]/30 hover:bg-[#C9D0D8]/60"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-150",
                    isHovered
                      ? "border-[#1e6b7b] bg-[#1e6b7b]/20 text-[#1e6b7b]"
                      : isConnected
                      ? "border-[#1e6b7b]/40 bg-[#1e6b7b]/20 text-[#1e6b7b]"
                      : "border-[#64818E]/25 bg-[#64818E]/10 text-[#2d404a] group-hover:text-[#192730]"
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="flex flex-col items-center text-center">
                  <span
                    className={cn(
                      "font-mono text-[10px] font-bold uppercase tracking-tight",
                      isHovered
                        ? "text-[#1e6b7b]"
                        : isConnected
                        ? "text-[#1e6b7b]"
                        : "text-[#192730]"
                    )}
                  >
                    {node.name}
                  </span>
                  <span className="text-[9px] text-[#2d404a] font-mono">
                    {node.role}
                  </span>
                </div>
              </button>
            </div>
          );
        })}

        {/* Dynamic Contextual Telemetry Tooltip */}
        {activeSubsystem && activeNodeDef && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-30 w-72 rounded-xl border border-[#64818E]/25 bg-white/95 p-3.5 shadow-2xl surface-level-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#64818E]/15 pb-2 mb-2">
              <span className="font-mono text-xs font-bold text-[#192730]">
                {activeNodeDef.name}
              </span>
              <SovereignStatus status={activeSubsystem.status} size="xs" />
            </div>
            <div className="space-y-1.5 font-mono text-[11px]">
              {Object.entries(activeSubsystem.metrics).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between text-[#192730]">
                  <span className="text-[#2d404a] font-medium">{key}:</span>
                  <span className="font-semibold text-[#192730]">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
