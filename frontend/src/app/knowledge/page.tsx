"use client";

import { useEffect, useState, useCallback } from "react";
import {
  searchKnowledge,
  queryKnowledge,
  listKnowledgeDocuments,
  deleteKnowledgeDocument,
  ingestDocument,
  type SearchResponse,
  type QueryResponse,
  type KnowledgeDocument,
  ApiError,
} from "@/lib/api";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

function fmtScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return `API error ${err.status}: ${err.statusText}`;
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KnowledgePage() {
  // -- RAG Query state -------------------------------------------------------
  const [ragQuery, setRagQuery] = useState("");
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResult, setRagResult] = useState<QueryResponse | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);

  // -- Vector Search state ---------------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // -- Documents state -------------------------------------------------------
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // -- Ingest state ----------------------------------------------------------
  const [ingestInput, setIngestInput] = useState("");
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);

  // -- Fetch documents -------------------------------------------------------
  const fetchDocuments = useCallback(async () => {
    try {
      const data = await listKnowledgeDocuments();
      setDocuments(data);
      setDocsError(null);
    } catch (err) {
      setDocsError(errorMessage(err));
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // -- RAG Query handler -----------------------------------------------------
  const handleRagQuery = useCallback(async () => {
    const trimmed = ragQuery.trim();
    if (!trimmed) return;
    setRagLoading(true);
    setRagError(null);
    setRagResult(null);
    try {
      const result = await queryKnowledge({ query: trimmed, top_k: 5 });
      setRagResult(result);
    } catch (err) {
      setRagError(errorMessage(err));
    } finally {
      setRagLoading(false);
    }
  }, [ragQuery]);

  // -- Vector Search handler -------------------------------------------------
  const handleSearch = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const result = await searchKnowledge({ query: trimmed, top_k: 10 });
      setSearchResult(result);
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  // -- Ingest handler --------------------------------------------------------
  const handleIngest = useCallback(async () => {
    const trimmed = ingestInput.trim();
    if (!trimmed) return;
    setIngestLoading(true);
    setIngestError(null);
    setIngestSuccess(null);
    try {
      const result = await ingestDocument(trimmed);
      setIngestSuccess(
        `Ingested "${result.filename}" - ${result.chunk_count} chunks in ${fmtMs(result.ingestion_time_ms)}`
      );
      setIngestInput("");
      await fetchDocuments();
    } catch (err) {
      setIngestError(errorMessage(err));
    } finally {
      setIngestLoading(false);
    }
  }, [ingestInput, fetchDocuments]);

  // -- Delete handler --------------------------------------------------------
  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeletingIds((prev) => new Set(prev).add(documentId));
      try {
        await deleteKnowledgeDocument(documentId);
        setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
        setConfirmDeleteId(null);
      } catch (err) {
        setDocsError(errorMessage(err));
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">Knowledge Base</h1>
        <p className="text-xs text-text-muted">
          Query, search, and manage your knowledge base documents
        </p>
      </div>

      {/* ── RAG Query Section ──────────────────────────────────────────── */}
      <Panel title="RAG Query" subtitle="Ask a question and get an answer with citations">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !ragLoading && handleRagQuery()}
              placeholder="Ask a question about your documents..."
              className="flex-1 bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
            />
            <Button
              variant="primary"
              onClick={handleRagQuery}
              loading={ragLoading}
              disabled={ragLoading || !ragQuery.trim()}
            >
              Query
            </Button>
          </div>

          {ragError && (
            <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-2.5 text-xs text-accent-red">
              {ragError}
            </div>
          )}

          {ragLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          )}

          {ragResult && (
            <div className="space-y-4">
              {/* Answer */}
              <div>
                <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Answer
                </h4>
                <div className="rounded-md border border-border-secondary bg-bg-tertiary/50 p-4 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {ragResult.answer}
                </div>
              </div>

              {/* Evidence Quality + Model */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Evidence:</span>
                  <StatusBadge status={ragResult.evidence_quality} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Model:</span>
                  <span className="text-xs text-text-secondary">{ragResult.model_used}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Retrieval count:</span>
                  <span className="text-xs text-text-secondary">{ragResult.retrieval_count}</span>
                </div>
              </div>

              {/* Timing Metrics */}
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Timing
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-md border border-border-secondary bg-bg-tertiary px-3 py-2">
                    <div className="text-[11px] text-text-muted">Retrieval</div>
                    <div className="text-sm font-medium text-accent-cyan">{fmtMs(ragResult.retrieval_time_ms)}</div>
                  </div>
                  <div className="rounded-md border border-border-secondary bg-bg-tertiary px-3 py-2">
                    <div className="text-[11px] text-text-muted">Generation</div>
                    <div className="text-sm font-medium text-accent-cyan">{fmtMs(ragResult.generation_time_ms)}</div>
                  </div>
                  <div className="rounded-md border border-border-secondary bg-bg-tertiary px-3 py-2">
                    <div className="text-[11px] text-text-muted">Embedding</div>
                    <div className="text-sm font-medium text-accent-cyan">{fmtMs(ragResult.embedding_time_ms)}</div>
                  </div>
                  <div className="rounded-md border border-border-secondary bg-bg-tertiary px-3 py-2">
                    <div className="text-[11px] text-text-muted">Total</div>
                    <div className="text-sm font-medium text-accent-green">{fmtMs(ragResult.total_time_ms)}</div>
                  </div>
                </div>
              </div>

              {/* Citations */}
              {ragResult.citations.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                    Citations ({ragResult.citations.length})
                  </h4>
                  <div className="space-y-2">
                    {ragResult.citations.map((citation, i) => (
                      <div
                        key={citation.chunk_id ?? `citation-${i}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border-secondary bg-bg-tertiary/50 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-text-primary">{citation.document}</span>
                        {citation.page != null && (
                          <span className="text-text-muted">
                            Page <span className="text-text-secondary">{citation.page}</span>
                          </span>
                        )}
                        {citation.section && (
                          <span className="text-text-muted">
                            Section: <span className="text-text-secondary">{citation.section}</span>
                          </span>
                        )}
                        {citation.relevance_score != null && (
                          <span className="text-text-muted">
                            Relevance: <span className="text-accent-blue">{fmtScore(citation.relevance_score)}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ragResult.citations.length === 0 && (
                <p className="text-xs text-text-muted">No citations returned.</p>
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* ── Vector Search Section ──────────────────────────────────────── */}
      <Panel title="Vector Search" subtitle="Raw similarity search across knowledge chunks">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !searchLoading && handleSearch()}
              placeholder="Search for similar content..."
              className="flex-1 bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
            />
            <Button
              variant="primary"
              onClick={handleSearch}
              loading={searchLoading}
              disabled={searchLoading || !searchQuery.trim()}
            >
              Search
            </Button>
          </div>

          {searchError && (
            <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-2.5 text-xs text-accent-red">
              {searchError}
            </div>
          )}

          {searchLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          )}

          {searchResult && (
            <div className="space-y-3">
              {/* Meta bar */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Evidence:</span>
                  <StatusBadge status={searchResult.evidence_quality} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Retrieval:</span>
                  <span className="text-xs text-accent-cyan">{fmtMs(searchResult.retrieval_time_ms)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Results:</span>
                  <span className="text-xs text-text-secondary">{searchResult.results.length}</span>
                </div>
              </div>

              {/* Results */}
              {searchResult.results.length === 0 ? (
                <EmptyState
                  title="No results"
                  description="No matching chunks found. Try a different query."
                />
              ) : (
                <div className="space-y-2">
                  {searchResult.results.map((item, i) => (
                    <div
                      key={item.chunk_id}
                      className="rounded-md border border-border-secondary bg-bg-tertiary/50 p-3"
                    >
                      {/* Chunk header */}
                      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="font-medium text-accent-blue">#{i + 1}</span>
                        <span className="font-medium text-text-primary">{item.filename}</span>
                        <span className="text-text-muted">
                          Score: <span className="text-accent-green">{fmtScore(item.score)}</span>
                        </span>
                        {item.page_number != null && (
                          <span className="text-text-muted">
                            Page <span className="text-text-secondary">{item.page_number}</span>
                          </span>
                        )}
                        {item.section && (
                          <span className="text-text-muted">
                            Section: <span className="text-text-secondary">{item.section}</span>
                          </span>
                        )}
                      </div>
                      {/* Chunk text */}
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-bg-primary border border-border-secondary p-2.5 text-xs text-text-secondary font-mono leading-relaxed">
                        {item.text}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* ── Knowledge Documents Section ────────────────────────────────── */}
      <Panel
        title="Knowledge Documents"
        subtitle={
          docsLoading
            ? "Loading..."
            : `${documents.length} document${documents.length === 1 ? "" : "s"} in knowledge base`
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDocsLoading(true);
              fetchDocuments();
            }}
          >
            Refresh
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Ingest input */}
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              Ingest Document
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={ingestInput}
                onChange={(e) => setIngestInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !ingestLoading && handleIngest()}
                placeholder="Enter document ID to ingest..."
                className="flex-1 bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
              <Button
                variant="primary"
                onClick={handleIngest}
                loading={ingestLoading}
                disabled={ingestLoading || !ingestInput.trim()}
              >
                Ingest
              </Button>
            </div>
            {ingestError && (
              <p className="mt-2 text-xs text-accent-red">{ingestError}</p>
            )}
            {ingestSuccess && (
              <p className="mt-2 text-xs text-accent-green">{ingestSuccess}</p>
            )}
          </div>

          {/* Error banner */}
          {docsError && (
            <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-2.5 text-xs text-accent-red">
              {docsError}
            </div>
          )}

          {/* Loading */}
          {docsLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          )}

          {/* Empty state */}
          {!docsLoading && documents.length === 0 && !docsError && (
            <EmptyState
              title="No knowledge documents"
              description="Ingest a document above to populate the knowledge base."
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                  />
                </svg>
              }
            />
          )}

          {/* Document table */}
          {!docsLoading && documents.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-xs uppercase tracking-wider text-text-muted">
                    <th className="pb-2 pr-4 font-medium">Filename</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Chunks</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Embedding Provider</th>
                    <th className="pb-2 pr-4 font-medium">Ingestion Time</th>
                    <th className="pb-2 pr-4 font-medium">Embedding Time</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-secondary">
                  {documents.map((doc) => {
                    const isDeleting = deletingIds.has(doc.document_id);
                    const isConfirming = confirmDeleteId === doc.document_id;

                    return (
                      <tr key={doc.document_id} className="group hover:bg-bg-hover/50">
                        <td className="py-2.5 pr-4">
                          <span className="font-medium text-text-primary">{doc.filename}</span>
                          {doc.error_info && (
                            <p className="mt-0.5 text-[11px] text-accent-red truncate max-w-xs" title={doc.error_info}>
                              {doc.error_info}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-xs text-text-secondary uppercase">{doc.file_type}</span>
                        </td>
                        <td className="py-2.5 pr-4 text-text-secondary">{doc.chunk_count}</td>
                        <td className="py-2.5 pr-4">
                          <StatusBadge status={doc.ingestion_status} />
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-text-secondary">{doc.embedding_provider}</td>
                        <td className="py-2.5 pr-4 text-xs text-text-secondary">{fmtMs(doc.ingestion_time_ms)}</td>
                        <td className="py-2.5 pr-4 text-xs text-text-secondary">{fmtMs(doc.embedding_time_ms)}</td>
                        <td className="py-2.5 text-right">
                          {isConfirming ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="danger"
                                size="sm"
                                loading={isDeleting}
                                onClick={() => handleDelete(doc.document_id)}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setConfirmDeleteId(doc.document_id)}
                            >
                              Remove from KB
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
