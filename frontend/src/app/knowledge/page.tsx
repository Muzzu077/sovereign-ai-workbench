"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import {
  listKnowledgeDocuments,
  searchKnowledge,
  queryKnowledge,
  deleteKnowledgeDocument,
  exportToDocx,
} from "@/lib/api/client";
import type {
  KnowledgeDocument,
  SearchResultItem,
  QueryResponse,
  EvidenceQuality,
} from "@/lib/api/types";
import { cn, formatBytes, formatDuration, formatRelativeTime, copyToClipboard } from "@/lib/utils";
import { EvidenceBadge, SourceCitation } from "@/components/workspace";
import {
  Search,
  BookOpen,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Database,
  MessageSquare,
  FileText,
  Sparkles,
  ArrowRight,
  Clock,
  Layers,
  CheckCircle2,
  Cpu,
  ShieldCheck,
  Download,
  Copy,
  Check,
  Share2,
  Sliders,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BackgroundGrid } from "@/components/ui/BackgroundGrid";
import { AnimatedTabs, type TabItem } from "@/components/ui/AnimatedTabs";
import { CountUp } from "@/components/ui/CountUp";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

type Tab = "query" | "search" | "documents";

const QUERY_PRESETS = [
  "What are the mandatory air-gapped system maintenance protocols?",
  "List all cryptographic standards and key management policies.",
  "Summarize key operational risks and audit procedures.",
];

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>("query");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchEvidence, setSearchEvidence] = useState<EvidenceQuality | null>(null);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);

  // Query state
  const [queryText, setQueryText] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoadingDocs(true);
      setError(null);
      const docs = await listKnowledgeDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge documents");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    setSearchEvidence(null);
    setSearchTime(null);
    setSearched(true);
    setError(null);
    try {
      const res = await searchKnowledge({ query: searchQuery, top_k: 10 });
      setSearchResults(res.results);
      setSearchEvidence(res.evidence_quality);
      setSearchTime(res.retrieval_time_ms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const handleQuery = useCallback(async (customQuery?: string) => {
    const q = customQuery || queryText;
    if (!q.trim()) return;
    if (customQuery) setQueryText(customQuery);
    setQueryLoading(true);
    setQueryResult(null);
    setError(null);
    try {
      const res = await queryKnowledge({ query: q, top_k: 5 });
      setQueryResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setQueryLoading(false);
    }
  }, [queryText]);

  const handleDeleteDoc = useCallback(
    async (docId: string) => {
      try {
        await deleteKnowledgeDocument(docId);
        setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [],
  );

  const handleCopyAnswer = async () => {
    if (!queryResult) return;
    const ok = await copyToClipboard(queryResult.answer);
    if (ok) {
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
    }
  };

  const handleExportDocx = async () => {
    if (!queryResult) return;
    try {
      setExportingDocx(true);
      const blob = await exportToDocx({
        title: `Knowledge Synthesis - ${queryText.slice(0, 40)}`,
        content: `# Grounded Knowledge Synthesis\n\n**Query:** ${queryText}\n**Model:** ${queryResult.model_used}\n**Retrieved Sources:** ${queryResult.retrieval_count}\n**Latency:** ${queryResult.total_time_ms}ms\n\n## Synthesized Answer\n${queryResult.answer}\n\n## Verified Citations\n${queryResult.citations.map((c) => `- **${c.document}** (Section: ${c.section || "N/A"}, Score: ${c.relevance_score ? `${(c.relevance_score * 100).toFixed(0)}%` : "N/A"})`).join("\n")}`,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge_synthesis_${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Best effort
    } finally {
      setExportingDocx(false);
    }
  };

  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);

  const TABS: TabItem<Tab>[] = [
    { id: "query", label: "RAG Query & Reasoning", icon: MessageSquare },
    { id: "search", label: "Neural Vector Search", icon: Search },
    { id: "documents", label: "Indexed Vector Store", icon: Database, badge: documents.length },
  ];

  return (
    <AppShell>
      <div className="relative flex h-full flex-col bg-[#070a12] overflow-hidden">
        <BackgroundGrid variant="dots" opacity={0.04} />

        {/* ── Subheader / Tab Bar ───────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] bg-slate-950/70 backdrop-blur-xl px-8 py-3.5 z-10">
          <AnimatedTabs
            tabs={TABS}
            activeTab={tab}
            onChange={(id) => setTab(id)}
            size="md"
          />

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400 bg-slate-900/80 border border-white/10 px-4 py-1.5 rounded-xl shadow-xs">
            <span className="flex items-center gap-1.5">
              <Database size={13} className="text-cyan-400" />
              <span className="font-extrabold text-white">
                <CountUp value={documents.length} duration={0.8} />
              </span> docs
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Layers size={13} className="text-cyan-400" />
              <span className="font-extrabold text-white">
                <CountUp value={totalChunks} duration={0.8} />
              </span> chunks
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 text-[11px] text-cyan-300 font-bold">
              <Cpu size={12} /> ONNX 384-D
            </span>
          </div>
        </div>

        {/* ── Tab Content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300">
                <AlertCircle size={15} className="shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="underline font-bold cursor-pointer">
                  Dismiss
                </button>
              </div>
            )}

            {/* ── 1. RAG Query Tab ────────────────────────────────────── */}
            {tab === "query" && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h1 className="text-base font-bold text-white tracking-tight">
                    Grounded Knowledge Query (RAG)
                  </h1>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Retrieve relevant vector passages and synthesize a deterministic, grounded answer backed by cited sources.
                  </p>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1">
                    Presets:
                  </span>
                  {QUERY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handleQuery(preset)}
                      className="text-left text-[11px] px-3 py-1 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-white/10 hover:border-cyan-500/30 text-slate-300 hover:text-white transition-all cursor-pointer shadow-xs"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {/* Input box */}
                <div className="rounded-2xl border border-white/[0.08] bg-slate-900/70 p-3 shadow-xl backdrop-blur-xl focus-within:border-cyan-500/50 transition-all">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                      placeholder="Ask a question across all indexed knowledge..."
                      className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none font-medium"
                    />
                    <ShimmerButton
                      onClick={() => handleQuery()}
                      loading={queryLoading}
                      disabled={!queryText.trim()}
                      variant="primary"
                      size="md"
                    >
                      <Sparkles size={14} />
                      <span>Query RAG</span>
                    </ShimmerButton>
                  </div>
                </div>

                {/* Results View */}
                {queryResult && (
                  <div className="space-y-4 animate-slide-up">
                    {/* Meta bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
                      <div className="flex items-center gap-2.5">
                        <EvidenceBadge quality={queryResult.evidence_quality} showDescription />
                        <span className="text-xs text-slate-400 font-mono">
                          {queryResult.retrieval_count} sources retrieved
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDuration(queryResult.total_time_ms)}
                        </span>
                        <span>·</span>
                        <span className="text-cyan-400 font-bold">{queryResult.model_used}</span>
                      </div>
                    </div>

                    {/* Answer Card */}
                    <SpotlightCard className="p-6 space-y-4" spotlightColor="rgba(6, 182, 212, 0.12)">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <Sparkles size={14} className="text-cyan-400" />
                          <span>Synthesized Knowledge Response</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleCopyAnswer}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-slate-400 hover:text-white bg-slate-800 border border-white/10 hover:border-cyan-500/30 transition-all cursor-pointer"
                          >
                            {copiedAnswer ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                            <span>{copiedAnswer ? "Copied" : "Copy"}</span>
                          </button>
                          <button
                            onClick={handleExportDocx}
                            disabled={exportingDocx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-slate-400 hover:text-white bg-slate-800 border border-white/10 hover:border-cyan-500/30 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Download size={12} className="text-cyan-400" />
                            <span>Export .DOCX</span>
                          </button>
                        </div>
                      </div>

                      <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
                        {queryResult.answer}
                      </div>
                    </SpotlightCard>

                    {/* Citations List */}
                    {queryResult.citations.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                          Grounding Evidence & Verification Citations ({queryResult.citations.length})
                        </span>
                        <div className="space-y-2">
                          {queryResult.citations.map((cit, idx) => (
                            <SourceCitation
                              key={idx}
                              citation={cit}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 2. Vector Search Tab ───────────────────────────────── */}
            {tab === "search" && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h1 className="text-base font-bold text-white tracking-tight">
                    Neural Vector Similarity Search
                  </h1>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Perform cosine similarity search across local dense embeddings to inspect matched text chunks without LLM synthesis.
                  </p>
                </div>

                {/* Search input */}
                <div className="rounded-2xl border border-white/[0.08] bg-slate-900/70 p-3 shadow-xl backdrop-blur-xl focus-within:border-cyan-500/50 transition-all">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-slate-400 ml-2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Enter search phrase to match vector embeddings..."
                      className="flex-1 bg-transparent px-2 py-2 text-xs text-white placeholder:text-slate-500 outline-none font-medium"
                    />
                    <ShimmerButton
                      onClick={handleSearch}
                      loading={searchLoading}
                      disabled={!searchQuery.trim()}
                      variant="primary"
                      size="md"
                    >
                      <span>Search Vectors</span>
                    </ShimmerButton>
                  </div>
                </div>

                {/* Results list */}
                {searched && (
                  <div className="space-y-3 animate-slide-up">
                    <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/[0.08] pb-2 font-mono">
                      <span>{searchResults.length} vector chunks matched</span>
                      {searchTime !== null && <span>Search Latency: {formatDuration(searchTime)}</span>}
                    </div>

                    {searchResults.length === 0 ? (
                      <div className="p-12 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40">
                        <Search size={22} className="text-slate-500 mx-auto mb-2 opacity-50" />
                        <span className="text-xs font-bold text-white">
                          No matching vectors found
                        </span>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Try adjusting search terms or verify indexed documents in the store tab.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {searchResults.map((res, i) => (
                          <SpotlightCard key={i} className="p-4 space-y-2" spotlightColor="rgba(6, 182, 212, 0.12)">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-white truncate max-w-sm">
                                  {res.filename || res.document_id}
                                </span>
                                {res.section && (
                                  <span className="rounded-md bg-slate-800 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
                                    {res.section}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 font-bold shrink-0">
                                <span>{(res.score * 100).toFixed(1)}% match</span>
                              </div>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-300 font-mono line-clamp-3">
                              {res.text}
                            </p>
                          </SpotlightCard>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 3. Indexed Documents Tab ───────────────────────────── */}
            {tab === "documents" && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-base font-bold text-white tracking-tight">
                      Indexed Knowledge Collections
                    </h1>
                    <p className="mt-1 text-xs text-slate-400">
                      Persistent local vector index storing embedded document segments.
                    </p>
                  </div>
                  <ShimmerButton
                    onClick={fetchDocuments}
                    loading={loadingDocs}
                    variant="secondary"
                    size="sm"
                  >
                    <RefreshCw size={12} className={cn(loadingDocs && "animate-spin-smooth")} />
                    <span>Refresh Store</span>
                  </ShimmerButton>
                </div>

                {loadingDocs ? (
                  <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-400 gap-2">
                    <Loader2 size={20} className="animate-spin-smooth text-cyan-400" />
                    <span>Inspecting vector collections...</span>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40">
                    <Database size={24} className="text-cyan-400 mx-auto mb-2 opacity-60" />
                    <h4 className="text-xs font-bold text-white">
                      Vector store is empty
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                      Go to Document Intelligence and click &quot;Ingest to Vector Index&quot; to populate knowledge embeddings.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {documents.map((doc) => (
                      <SpotlightCard key={doc.document_id} className="p-4" spotlightColor="rgba(6, 182, 212, 0.12)">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <BookOpen size={14} className="text-cyan-400 shrink-0" />
                              <h3 className="text-xs font-bold text-white truncate" title={doc.filename}>
                                {doc.filename}
                              </h3>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                              <span>{doc.chunk_count} vector chunks</span>
                              <span>·</span>
                              <span>Indexed {formatRelativeTime(doc.ingested_at)}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteDoc(doc.document_id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Remove from vector index"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </SpotlightCard>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
