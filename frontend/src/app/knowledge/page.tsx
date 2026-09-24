"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import {
  listKnowledgeDocuments,
  searchKnowledge,
  queryKnowledge,
  deleteKnowledgeDocument,
} from "@/lib/api/client";
import type {
  KnowledgeDocument,
  SearchResultItem,
  QueryResponse,
  EvidenceQuality,
} from "@/lib/api/types";
import { cn, formatBytes, formatDuration, formatRelativeTime } from "@/lib/utils";
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
} from "lucide-react";

type Tab = "query" | "search" | "documents";

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

  const handleQuery = useCallback(async () => {
    if (!queryText.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);
    setError(null);
    try {
      const res = await queryKnowledge({ query: queryText, top_k: 5 });
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

  const statusBadge = (status: string) => {
    const isIndexed = status === "indexed";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
          isIndexed
            ? "bg-[var(--color-wb-success-bg)] text-[var(--color-wb-success)]"
            : "bg-[var(--color-wb-warning-bg)] text-[var(--color-wb-warning)]",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isIndexed ? "bg-[var(--color-wb-success)]" : "bg-[var(--color-wb-warning)]",
          )}
        />
        {status}
      </span>
    );
  };

  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);

  const TABS: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "query", label: "RAG Query", icon: MessageSquare },
    { key: "search", label: "Semantic Search", icon: Search },
    { key: "documents", label: "Indexed Documents", icon: Database, count: documents.length },
  ];

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-[var(--color-wb-bg)]">
        {/* ── Subheader / Tab Bar ───────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] px-8">
          <div className="flex items-center gap-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-medium transition-colors cursor-pointer",
                    active
                      ? "border-[var(--color-wb-accent)] text-[var(--color-wb-accent)]"
                      : "border-transparent text-[var(--color-wb-text-muted)] hover:text-[var(--color-wb-text)]",
                  )}
                >
                  <Icon size={14} />
                  <span>{t.label}</span>
                  {t.count !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                        active
                          ? "bg-[var(--color-wb-accent-subtle)] text-[var(--color-wb-accent)]"
                          : "bg-[var(--color-wb-bg-inset)] text-[var(--color-wb-text-muted)]",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs text-[var(--color-wb-text-muted)]">
            <span className="flex items-center gap-1.5">
              <Database size={13} />
              <span className="font-mono">{documents.length}</span> documents
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Layers size={13} />
              <span className="font-mono">{totalChunks}</span> chunks
            </span>
          </div>
        </div>

        {/* ── Tab Content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-[var(--color-wb-error-bg)] border border-[var(--color-wb-error-border)] p-3.5 text-xs text-[var(--color-wb-error)]">
                <AlertCircle size={15} className="shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="underline font-medium cursor-pointer">
                  Dismiss
                </button>
              </div>
            )}

            {/* ── 1. RAG Query Tab ────────────────────────────────────── */}
            {tab === "query" && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h1 className="text-base font-semibold text-[var(--color-wb-text)]">
                    Grounded Knowledge Query (RAG)
                  </h1>
                  <p className="mt-1 text-xs text-[var(--color-wb-text-muted)] leading-relaxed">
                    Ask questions across your entire knowledge base. The system retrieves relevant document chunks and synthesizes a verified answer with citations.
                  </p>
                </div>

                {/* Input box */}
                <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-3 shadow-sm focus-within:border-[var(--color-wb-border-strong)] transition-colors">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                      placeholder="e.g. What are the key safety requirements mentioned in the manuals?"
                      className="flex-1 bg-transparent px-2 py-1.5 text-xs text-[var(--color-wb-text)] placeholder:text-[var(--color-wb-text-muted)] outline-none"
                    />
                    <button
                      onClick={handleQuery}
                      disabled={queryLoading || !queryText.trim()}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer shadow-sm",
                        "bg-[var(--color-wb-accent)] hover:bg-[var(--color-wb-accent-hover)]",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {queryLoading ? (
                        <>
                          <Loader2 size={13} className="animate-spin-smooth" />
                          <span>Generating answer...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Query RAG</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Results View */}
                {queryResult && (
                  <div className="space-y-4 animate-slide-up">
                    {/* Meta bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-wb-border)] pb-3">
                      <div className="flex items-center gap-2">
                        <EvidenceBadge quality={queryResult.evidence_quality} />
                        <span className="text-[11px] text-[var(--color-wb-text-muted)]">
                          {queryResult.retrieval_count} sources retrieved
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--color-wb-text-muted)] font-mono">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDuration(queryResult.total_time_ms)}
                        </span>
                        <span>·</span>
                        <span>Model: {queryResult.model_used}</span>
                      </div>
                    </div>

                    {/* Answer Card */}
                    <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-5 shadow-sm space-y-3">
                      <div className="text-xs font-semibold text-[var(--color-wb-text)]">
                        Synthesized Answer
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--color-wb-text-secondary)] whitespace-pre-wrap">
                        {queryResult.answer}
                      </p>
                    </div>

                    {/* Citations */}
                    {queryResult.citations && queryResult.citations.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-wb-text-muted)]">
                          Cited Sources ({queryResult.citations.length})
                        </h3>
                        <div className="grid gap-2">
                          {queryResult.citations.map((c, i) => (
                            <SourceCitation key={c.chunk_id ?? i} citation={c} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 2. Semantic Search Tab ──────────────────────────────── */}
            {tab === "search" && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h1 className="text-base font-semibold text-[var(--color-wb-text)]">
                    Vector Semantic Search
                  </h1>
                  <p className="mt-1 text-xs text-[var(--color-wb-text-muted)] leading-relaxed">
                    Search document chunks by semantic embedding similarity without running an LLM synthesis step.
                  </p>
                </div>

                {/* Search input */}
                <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-3 shadow-sm focus-within:border-[var(--color-wb-border-strong)] transition-colors">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-[var(--color-wb-text-muted)] shrink-0 ml-1" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Enter search concept or phrase..."
                      className="flex-1 bg-transparent px-2 py-1.5 text-xs text-[var(--color-wb-text)] placeholder:text-[var(--color-wb-text-muted)] outline-none"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={searchLoading || !searchQuery.trim()}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer shadow-sm",
                        "bg-[var(--color-wb-accent)] hover:bg-[var(--color-wb-accent-hover)]",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {searchLoading ? (
                        <>
                          <Loader2 size={13} className="animate-spin-smooth" />
                          <span>Searching...</span>
                        </>
                      ) : (
                        <>
                          <span>Search</span>
                          <ArrowRight size={13} />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Search meta summary */}
                {searched && !searchLoading && (
                  <div className="flex items-center justify-between text-xs text-[var(--color-wb-text-muted)] border-b border-[var(--color-wb-border)] pb-2">
                    <div className="flex items-center gap-2">
                      <span>Found {searchResults.length} relevant chunks</span>
                      {searchEvidence && <EvidenceBadge quality={searchEvidence} />}
                    </div>
                    {searchTime !== null && (
                      <span className="font-mono text-[11px]">
                        Retrieved in {formatDuration(searchTime)}
                      </span>
                    )}
                  </div>
                )}

                {/* Results list */}
                {searchResults.length > 0 ? (
                  <div className="space-y-3">
                    {searchResults.map((item, idx) => {
                      const scorePercent = Math.round(item.score * 100);
                      return (
                        <div
                          key={item.chunk_id || idx}
                          className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-4 shadow-sm hover:border-[var(--color-wb-border-strong)] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-wb-border-subtle)] pb-2 mb-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={13} className="text-[var(--color-wb-accent)] shrink-0" />
                              <span className="text-xs font-semibold text-[var(--color-wb-text)] truncate">
                                {item.filename}
                              </span>
                              {item.page_number && (
                                <span className="text-[10px] text-[var(--color-wb-text-muted)] bg-[var(--color-wb-bg-inset)] px-1.5 py-0.5 rounded">
                                  Page {item.page_number}
                                </span>
                              )}
                              {item.section && (
                                <span className="text-[10px] text-[var(--color-wb-text-muted)] truncate max-w-[140px]">
                                  {item.section}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="w-14 h-1.5 rounded-full bg-[var(--color-wb-bg-inset)] overflow-hidden">
                                <div
                                  className="h-full bg-[var(--color-wb-accent)] rounded-full"
                                  style={{ width: `${scorePercent}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-[var(--color-wb-accent)]">
                                {scorePercent}%
                              </span>
                            </div>
                          </div>

                          <p className="text-xs leading-relaxed text-[var(--color-wb-text-secondary)] whitespace-pre-wrap">
                            {item.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : searched && !searchLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--color-wb-text-muted)]">
                    <Search size={22} className="mb-2 opacity-30" />
                    <span>No matching chunks found for this query</span>
                  </div>
                ) : null}
              </div>
            )}

            {/* ── 3. Indexed Documents Tab ────────────────────────────── */}
            {tab === "documents" && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-base font-semibold text-[var(--color-wb-text)]">
                      Indexed Knowledge Store
                    </h1>
                    <p className="mt-1 text-xs text-[var(--color-wb-text-muted)]">
                      Documents embedded and stored in the local vector database available for RAG.
                    </p>
                  </div>
                  <button
                    onClick={fetchDocuments}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)] transition-colors cursor-pointer shadow-sm"
                  >
                    <RefreshCw size={13} className={cn(loadingDocs && "animate-spin-smooth")} />
                    <span>Refresh</span>
                  </button>
                </div>

                {loadingDocs ? (
                  <div className="flex flex-col items-center justify-center py-16 text-xs text-[var(--color-wb-text-muted)] gap-2">
                    <Loader2 size={18} className="animate-spin-smooth text-[var(--color-wb-accent)]" />
                    <span>Loading indexed documents...</span>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-wb-border)] p-12 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-wb-bg-inset)] mb-3">
                      <Database size={18} className="text-[var(--color-wb-text-muted)]" />
                    </div>
                    <span className="text-xs font-semibold text-[var(--color-wb-text)]">
                      No documents indexed yet
                    </span>
                    <p className="mt-1 text-[11px] text-[var(--color-wb-text-muted)] max-w-sm">
                      Go to the Documents tab, upload a document, and click &quot;Ingest to Knowledge Base&quot;.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-wb-border)] bg-[var(--color-wb-bg-inset)]">
                          <th className="px-4 py-3 font-semibold text-[var(--color-wb-text-secondary)]">Document</th>
                          <th className="px-3 py-3 font-semibold text-[var(--color-wb-text-secondary)]">Type</th>
                          <th className="px-3 py-3 font-semibold text-[var(--color-wb-text-secondary)]">Chunks</th>
                          <th className="px-3 py-3 font-semibold text-[var(--color-wb-text-secondary)]">Status</th>
                          <th className="px-4 py-3 font-semibold text-[var(--color-wb-text-secondary)]">Ingested</th>
                          <th className="px-3 py-3 font-semibold text-[var(--color-wb-text-secondary)] text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-wb-border)]">
                        {documents.map((doc) => (
                          <tr key={doc.document_id} className="hover:bg-[var(--color-wb-surface-hover)] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <BookOpen size={14} className="text-[var(--color-wb-accent)] shrink-0" />
                                <span className="font-medium text-[var(--color-wb-text)] truncate max-w-[220px]" title={doc.filename}>
                                  {doc.filename}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="rounded bg-[var(--color-wb-bg-inset)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--color-wb-text-muted)]">
                                {doc.file_type}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono text-[11px] text-[var(--color-wb-text-secondary)]">
                              {doc.chunk_count}
                            </td>
                            <td className="px-3 py-3">
                              {statusBadge(doc.ingestion_status)}
                            </td>
                            <td className="px-4 py-3 text-[11px] text-[var(--color-wb-text-muted)]">
                              {formatRelativeTime(doc.ingested_at)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button
                                onClick={() => handleDeleteDoc(doc.document_id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-wb-text-muted)] hover:bg-[var(--color-wb-error-bg)] hover:text-[var(--color-wb-error)] transition-colors cursor-pointer"
                                title="Remove from vector store"
                                aria-label="Remove from vector store"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
