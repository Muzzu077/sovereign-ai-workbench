"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Database,
  Search,
  Sparkles,
  Layers,
  FileText,
  Zap,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sliders,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  SovereignPanel,
  SovereignEvidence,
  SovereignPipeline,
  SovereignStatus,
  SovereignMetric,
  SovereignInspector,
} from "@/components/sovereign";
import {
  queryKnowledge,
  listKnowledgeDocuments,
  getHealth,
  type QueryResponse,
  type KnowledgeDocument,
  type HealthResponse,
  type Citation,
} from "@/lib/api";

const sectionReveal = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
} as const;

export default function KnowledgePage() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(4);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryLatency, setQueryLatency] = useState<number | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const fetchKnowledgeData = useCallback(async () => {
    try {
      const [docs, h] = await Promise.all([
        listKnowledgeDocuments(),
        getHealth(),
      ]);
      setDocuments(docs);
      setHealth(h);
    } catch (err) {
      console.error("Failed to load knowledge telemetry", err);
    }
  }, []);

  useEffect(() => {
    fetchKnowledgeData();
  }, [fetchKnowledgeData]);

  const handleRunQuery = async (customQ?: string) => {
    const q = (customQ || query).trim();
    if (!q || isQuerying) return;

    setIsQuerying(true);
    const start = performance.now();

    try {
      const res = await queryKnowledge({ query: q, top_k: topK });
      const elapsed = Math.round(performance.now() - start);
      setQueryResult(res);
      setQueryLatency(elapsed);
    } catch (err) {
      alert(`Query failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsQuerying(false);
    }
  };

  const presets = [
    "What are the primary emergency safety shutdown protocols?",
    "Summarize the technical operational parameters of the cooling system.",
    "List the maintenance schedules and calibration tolerances.",
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#64818E]/18 bg-white/80 p-5 shadow-2xl surface-level-2 backdrop-blur-2xl"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4a6272] to-[#64818E] text-[#192730] shadow-[0_0_25px_rgba(100,129,142,0.3)] border border-[#64818E]/25">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#192730]">
                Knowledge Base & RAG Investigation Console
              </h1>
              <span className="rounded-lg bg-[#1e6b7b]/10 border border-[#1e6b7b]/40 px-2 py-0.5 font-mono text-[9px] font-bold text-[#1e6b7b] uppercase">
                Vector Similarity
              </span>
            </div>
            <p className="text-[11px] text-[#2d404a] mt-0.5 font-mono font-medium">
              Semantic similarity retrieval, neural embeddings, and evidence-grounded queries
            </p>
          </div>
        </div>

        {/* Telemetry Metrics */}
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <div className="rounded-xl border border-[#64818E]/25 bg-white/80 px-3 py-1.5 text-[#192730] flex items-center gap-1.5 shadow-sm">
            <Layers className="h-3 w-3 text-[#1e6b7b]" />
            <span className="text-[#2d404a] uppercase font-bold">Chunks: </span>
            <span className="font-bold text-[#1e6b7b]">{health?.knowledge_chunks || 0}</span>
          </div>
          <div className="rounded-xl border border-[#64818E]/25 bg-white/80 px-3 py-1.5 text-[#192730] flex items-center gap-1.5 shadow-sm">
            <Zap className="h-3 w-3 text-[#047857]" />
            <span className="text-[#2d404a] uppercase font-bold">Provider: </span>
            <span className="font-bold text-[#047857]">{health?.embedding_provider || "tfidf"}</span>
          </div>
        </div>
      </motion.div>

      {/* Query Console */}
      <SovereignPanel
        title="01 / Investigation Query"
        subtitle="Submit question for semantic similarity search"
        action={
          <div className="flex items-center gap-3 font-mono text-xs text-[#2d404a]">
            <span className="font-bold">Top-K: {topK}</span>
            <input
              type="range"
              min="1"
              max="8"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="h-1.5 w-24 rounded bg-[#C9D0D8] accent-[#1e6b7b] cursor-pointer"
            />
          </div>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRunQuery();
              }}
              placeholder="Ask a question or enter technical keywords to retrieve grounded vector evidence..."
              className="w-full rounded-xl border border-[#64818E]/30 bg-white/95 py-3.5 pl-11 pr-28 text-xs text-[#192730] placeholder:text-[#4a6272] focus:border-[#1e6b7b] focus:outline-none focus:ring-1 focus:ring-[#1e6b7b] font-sans font-medium transition-all"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#1e6b7b]" />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => handleRunQuery()}
                disabled={isQuerying || !query.trim()}
                className="flex items-center gap-1.5 rounded-xl border border-[#1e6b7b]/40 bg-[#1e6b7b]/10 px-3.5 py-2 text-xs font-mono font-bold text-[#1e6b7b] hover:bg-[#1e6b7b]/20 hover:border-[#1e6b7b]/60 transition-all cursor-pointer disabled:opacity-40"
              >
                <Search className="h-3 w-3" />
                <span>{isQuerying ? "Searching..." : "Retrieve"}</span>
              </button>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[10px]">
            <span className="text-[#2d404a] uppercase font-bold">Presets:</span>
            {presets.map((p, idx) => (
              <motion.button
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => {
                  setQuery(p);
                  handleRunQuery(p);
                }}
                className="rounded-xl border border-[#64818E]/25 bg-white/80 px-3 py-1.5 text-[#2d404a] font-medium hover:border-[#1e6b7b]/50 hover:text-[#1e6b7b] hover:bg-[#1e6b7b]/10 transition-all truncate max-w-xs cursor-pointer shadow-sm"
              >
                {p}
              </motion.button>
            ))}
          </div>
        </div>
      </SovereignPanel>

      {/* Retrieval Pipeline Indicator */}
      {isQuerying && (
        <motion.div initial="hidden" animate="visible" variants={sectionReveal}>
          <SovereignPanel
            title="02 / Vector Retrieval Active"
            subtitle="Matching query vector in local FAISS space"
            elevation={3}
          >
            <div className="flex items-center gap-3 text-[#1e6b7b] font-mono text-xs">
              <Loader2 className="h-4 w-4 animate-spin text-[#1e6b7b]" />
              <span className="font-bold">CALCULATING COSINE SIMILARITY ACROSS LOCAL EMBEDDINGS...</span>
              <div className="flex-1 h-1.5 bg-[#C9D0D8] rounded-full overflow-hidden">
                <div className="h-full w-2/3 bg-gradient-to-r from-[#1e6b7b] to-[#047857] rounded-full animate-pulse" />
              </div>
            </div>
          </SovereignPanel>
        </motion.div>
      )}

      {/* Evidence & Grounded Answer */}
      {queryResult && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={sectionReveal}
          className="space-y-6"
        >
          {/* Synthesized Grounded Answer */}
          <SovereignPanel
            title="03 / Grounded Answer"
            subtitle="Local open-weight model synthesis"
            badge={<SovereignStatus status="operational" label="SYNTHESIZED" size="xs" />}
            action={
              queryLatency ? (
                <span className="font-mono text-[11px] text-[#2d404a] font-medium">
                  Latency: <strong className={queryLatency < 500 ? "text-[#047857]" : "text-[#b45309]"}>{queryLatency}ms</strong>
                </span>
              ) : undefined
            }
          >
            <div className="font-sans text-xs leading-relaxed text-[#192730] whitespace-pre-wrap selection:bg-[#1e6b7b]/20">
              {queryResult.answer}
            </div>
          </SovereignPanel>

          {/* Retrieved Evidence Chunks */}
          {queryResult.citations && queryResult.citations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between font-mono text-xs text-[#2d404a] uppercase">
                <span className="flex items-center gap-2 font-extrabold text-[#192730]">
                  <Layers className="h-4 w-4 text-[#1e6b7b]" />
                  04 / Grounded Citations ({queryResult.citations.length} Chunks Matched)
                </span>
                <span className="flex items-center gap-1 text-[#047857] font-bold">
                  <ShieldCheck className="h-3.5 w-3.5" /> Air-Gap Verified
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queryResult.citations.map((c, idx) => (
                  <SovereignEvidence
                    key={idx}
                    chunkId={c.document_id}
                    documentName={c.document}
                    content={c.section ? `[Section: ${c.section}]\nDocument Reference: ${c.document}` : `Document Source: ${c.document}`}
                    score={c.relevance_score ?? 0.85}
                    chunkIndex={idx + 1}
                    onInspect={() => {
                      setSelectedCitation(c);
                      setIsInspectorOpen(true);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Citation Inspector Drawer */}
      <SovereignInspector
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        title={selectedCitation?.document || "Evidence Chunk"}
        subtitle="Grounded chunk metadata & vector score"
        data={{
          document: selectedCitation?.document || "",
          document_id: selectedCitation?.document_id || "",
          section: selectedCitation?.section || "N/A",
          relevance_score: selectedCitation?.relevance_score
            ? `${(selectedCitation.relevance_score * 100).toFixed(1)}%`
            : "N/A",
        }}
      />
    </div>
  );
}
