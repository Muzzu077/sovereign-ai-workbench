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
} from "@/lib/api/types";
import { cn, formatBytes, formatDuration, formatRelativeTime, copyToClipboard } from "@/lib/utils";
import {
  Search,
  BookOpenText,
  Database,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  Download,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";

const QUERY_PRESETS = [
  "What are the mandatory air-gapped system maintenance protocols?",
  "List all cryptographic standards and key management policies.",
  "Summarize key operational risks and audit procedures.",
];

function EmptyState({ icon: Icon, title, description }: { icon: typeof Database; title: string; description: string }) {
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

export default function KnowledgePage() {
  const [tab, setTab] = useState<"query" | "search" | "documents">("query");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
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
    setSearchTime(null);
    try {
      const res = await searchKnowledge({ query: searchQuery, top_k: 10 });
      setSearchResults(res.results);
      setSearchTime(res.retrieval_time_ms);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const handleQuery = useCallback(async (overrideText?: string) => {
    const text = overrideText || queryText;
    if (!text.trim()) return;
    if (overrideText) setQueryText(overrideText);
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const res = await queryKnowledge({ query: text, top_k: 5 });
      setQueryResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Knowledge query failed");
    } finally {
      setQueryLoading(false);
    }
  }, [queryText]);

  const handleDelete = useCallback(async (docId: string) => {
    if (!confirm("Remove this document and all indexed chunks from vector store?")) return;
    try {
      await deleteKnowledgeDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete knowledge document");
    }
  }, []);

  const handleCopyAnswer = async () => {
    if (!queryResult?.answer) return;
    const ok = await copyToClipboard(queryResult.answer);
    if (ok) {
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
    }
  };

  const handleExport = async () => {
    if (!queryResult?.answer) return;
    try {
      setExportingDocx(true);
      const blob = await exportToDocx({
        title: `RAG Briefing - ${queryText}`,
        content: `# Evidence Synthesis\n\n**Query:** ${queryText}\n**Evidence Quality:** ${queryResult.evidence_quality}\n\n## Answer\n${queryResult.answer}`,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rag_briefing_${Date.now()}.docx`;
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

  const totalChunks = documents.reduce((acc, d) => acc + d.chunk_count, 0);

  return (
    <AppShell>
      <main className="mx-auto max-w-[1420px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {/* Page Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
              <BookOpenText className="size-3.5" /> RETRIEVAL / 02
            </div>
            <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl text-foreground">
              Knowledge base
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Find evidence across indexed organizational knowledge.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDocuments}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-panel text-xs text-muted-foreground hover:text-foreground hover:bg-panel-hover transition-colors"
              title="Refresh knowledge base"
            >
              <RefreshCw className={cn("size-3.5", loadingDocs && "animate-spin")} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Status Line */}
        <div className="mb-7 flex items-center gap-2 border-y border-border py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          VECTOR STORE ACTIVE
          <span className="mx-2 text-faint">/</span>
          {documents.length} DOCUMENT{documents.length === 1 ? "" : "S"} ({totalChunks} CHUNKS)
          <span className="mx-2 text-faint">/</span>
          DENSE 384-D EMBEDDINGS
        </div>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-3 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive rounded-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs hover:underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Sub-Tab Navigation */}
        <div className="mb-6 flex items-center gap-1 border-b border-border pb-3 text-xs font-mono">
          <button
            onClick={() => setTab("query")}
            className={cn(
              "px-3 py-1.5 rounded transition-colors",
              tab === "query" ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            RAG INFERENCE
          </button>
          <button
            onClick={() => setTab("search")}
            className={cn(
              "px-3 py-1.5 rounded transition-colors",
              tab === "search" ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            VECTOR SEARCH
          </button>
          <button
            onClick={() => setTab("documents")}
            className={cn(
              "px-3 py-1.5 rounded transition-colors",
              tab === "documents" ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            INDEXED CORPUS ({documents.length})
          </button>
        </div>

        {/* Layout Grid */}
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          {/* Main Area */}
          <div className="space-y-6">
            {/* ── 1. RAG Query Tab ────────────────────────────────────── */}
            {tab === "query" && (
              <div className="space-y-5">
                {/* Presets */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">PRESETS:</span>
                  {QUERY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handleQuery(preset)}
                      className="text-left text-xs px-2.5 py-1 rounded border border-border bg-panel text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {/* Input Bar */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                  <input
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                    placeholder="Ask a question across all indexed knowledge..."
                    className="h-11 w-full rounded border border-border bg-panel pl-10 pr-28 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => handleQuery()}
                    disabled={queryLoading || !queryText.trim()}
                    className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                  >
                    {queryLoading ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    <span>Synthesize</span>
                  </button>
                </div>

                {/* Results View */}
                {queryResult ? (
                  <div className="border border-border bg-panel p-6 space-y-4 rounded-md">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                          EVIDENCE: {queryResult.evidence_quality.toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {queryResult.retrieval_count} SOURCES · {formatDuration(queryResult.total_time_ms)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyAnswer}
                          className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy Answer"
                        >
                          {copiedAnswer ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
                        </button>
                        <button
                          onClick={handleExport}
                          disabled={exportingDocx}
                          className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                          title="Download DOCX"
                        >
                          <Download className="size-3" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                      {queryResult.answer}
                    </div>

                    {queryResult.citations && queryResult.citations.length > 0 && (
                      <div className="pt-4 border-t border-border space-y-2">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          VERIFIED CITATIONS ({queryResult.citations.length})
                        </div>
                        <div className="grid gap-2">
                          {queryResult.citations.map((s, idx) => (
                            <div key={idx} className="border border-border p-3 bg-muted/20 rounded text-xs space-y-1">
                              <div className="flex items-center justify-between font-mono text-[10px] text-primary">
                                <span>{s.document}</span>
                                <span>SCORE: {s.relevance_score ? `${(s.relevance_score * 100).toFixed(1)}%` : "N/A"}</span>
                              </div>
                              <p className="text-muted-foreground line-clamp-3 text-[11px] leading-5">
                                {s.chunk_id || "Grounded vector passage"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : !queryLoading && (
                  <EmptyState
                    icon={Database}
                    title="No query executed"
                    description="Evidence-backed results, source references, and retrieval scores will appear here when you query the knowledge base."
                  />
                )}
              </div>
            )}

            {/* ── 2. Vector Search Tab ─────────────────────────────────── */}
            {tab === "search" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Search vector embeddings..."
                    className="h-11 w-full rounded border border-border bg-panel pl-10 pr-24 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searchLoading || !searchQuery.trim()}
                    className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    {searchLoading ? <Loader2 className="size-3 animate-spin" /> : "Search"}
                  </button>
                </div>

                {searched && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                      <span>{searchResults.length} matches found</span>
                      {searchTime !== null && <span>Query completed in {searchTime.toFixed(1)}ms</span>}
                    </div>

                    {searchResults.length ? (
                      <div className="border border-border divide-y divide-border bg-panel/30">
                        {searchResults.map((item, idx) => (
                          <div key={idx} className="p-4 space-y-1.5">
                            <div className="flex items-center justify-between font-mono text-[10px] text-primary">
                              <span>{item.filename} · Chunk {item.chunk_id}</span>
                              <span>Score {(item.score * 100).toFixed(1)}%</span>
                            </div>
                            <p className="text-xs text-foreground leading-relaxed">
                              {item.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center border border-dashed border-border text-xs text-muted-foreground">
                        No vector matches found for your query.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 3. Indexed Corpus Tab ─────────────────────────────────── */}
            {tab === "documents" && (
              <div className="space-y-4">
                {loadingDocs ? (
                  <div className="flex flex-col items-center justify-center border border-border bg-panel/35 py-16 text-xs text-muted-foreground gap-2">
                    <Loader2 className="size-5 animate-spin text-primary" />
                    <span>Loading indexed corpus...</span>
                  </div>
                ) : documents.length ? (
                  <div className="border border-border bg-panel/30">
                    {documents.map((doc) => (
                      <div
                        key={doc.document_id}
                        className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {doc.filename}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-muted-foreground flex flex-wrap items-center gap-2">
                            <span>{doc.chunk_count} chunks</span>
                            <span>·</span>
                            <span>{doc.file_type.toUpperCase()}</span>
                            {doc.ingested_at && (
                              <>
                                <span>·</span>
                                <span>Indexed {formatRelativeTime(doc.ingested_at)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDelete(doc.document_id)}
                          aria-label={`Remove ${doc.filename}`}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Database}
                    title="No indexed documents"
                    description="Documents ingested from the library will appear here once converted to vector representations."
                  />
                )}
              </div>
            )}
          </div>

          {/* Right Aside (matches reference) */}
          <div className="space-y-4">
            <div className="border border-border bg-panel p-5">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">INDEX STATUS</div>
              <div className="mt-4 flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" />
                <span className="text-sm font-medium text-foreground">Operational</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                In-memory vector store backing local dense similarity search.
              </div>
            </div>

            <div className="border border-border bg-panel p-5">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">EVIDENCE POLICY</div>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Results should be grounded in local documents with inspectable citations. No external lookups are permitted.
              </p>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
