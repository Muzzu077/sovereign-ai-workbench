"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/shell/AppShell";
import {
  listFiles,
  uploadFile,
  deleteFile,
  analyzeDocument,
  ingestDocument,
} from "@/lib/api/client";
import type { FileInfo, AnalysisResult } from "@/lib/api/types";
import { cn, formatBytes, formatRelativeTime, copyToClipboard } from "@/lib/utils";
import {
  Upload,
  Trash2,
  FileText,
  Search as SearchIcon,
  BookOpen,
  Loader2,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  ShieldAlert,
  ListChecks,
  X,
  FileCode,
} from "lucide-react";

interface DocumentWithAnalysis extends FileInfo {
  analysis?: AnalysisResult;
  analyzing?: boolean;
  ingesting?: boolean;
  ingestSuccess?: boolean;
}

function FileTypeBadge({ extension }: { extension: string }) {
  const ext = extension.toLowerCase();
  const label = ext.toUpperCase() || "FILE";

  const colorMap: Record<string, string> = {
    pdf: "bg-red-50 text-red-700 border-red-200",
    docx: "bg-sky-50 text-sky-700 border-sky-200",
    doc: "bg-sky-50 text-sky-700 border-sky-200",
    txt: "bg-stone-100 text-stone-600 border-stone-200",
  };

  const colorClass = colorMap[ext] ?? "bg-stone-100 text-stone-500 border-stone-200";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        "w-8 h-7 rounded border shrink-0",
        "text-[9px] font-bold font-mono uppercase tracking-wider leading-none",
        colorClass,
      )}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    completed: {
      bg: "bg-[var(--color-wb-success-bg)]",
      text: "text-[var(--color-wb-success)]",
      dot: "bg-[var(--color-wb-success)]",
      label: "Extracted",
    },
    pending: {
      bg: "bg-[var(--color-wb-warning-bg)]",
      text: "text-[var(--color-wb-warning)]",
      dot: "bg-[var(--color-wb-warning)]",
      label: "Pending",
    },
    processing: {
      bg: "bg-[var(--color-wb-info-bg)]",
      text: "text-[var(--color-wb-info)]",
      dot: "bg-[var(--color-wb-info)]",
      label: "Processing",
    },
    failed: {
      bg: "bg-[var(--color-wb-error-bg)]",
      text: "text-[var(--color-wb-error)]",
      dot: "bg-[var(--color-wb-error)]",
      label: "Failed",
    },
  };
  const s = map[status] || map.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium leading-none",
        s.bg,
        s.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedPreview, setCopiedPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listFiles();
      setDocuments(response.files.map((f) => ({ ...f })));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load documents",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Select first document automatically when list loads if none selected
  useEffect(() => {
    if (!selected && documents.length > 0) {
      setSelected(documents[0].document_id);
    }
  }, [documents, selected]);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setError(null);
      try {
        const fileArr = Array.from(files);
        for (const file of fileArr) {
          const res = await uploadFile(file);
          // If we have a new doc, select it
          if (res?.document_id) {
            setSelected(res.document_id);
          }
        }
        await fetchDocuments();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [fetchDocuments],
  );

  const handleDelete = useCallback(
    async (docId: string) => {
      try {
        await deleteFile(docId);
        setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
        if (selected === docId) {
          const remaining = documents.filter((d) => d.document_id !== docId);
          setSelected(remaining.length > 0 ? remaining[0].document_id : null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [selected, documents],
  );

  const handleAnalyze = useCallback(async (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.document_id === docId ? { ...d, analyzing: true } : d,
      ),
    );
    try {
      const result = await analyzeDocument(docId);
      setDocuments((prev) =>
        prev.map((d) =>
          d.document_id === docId
            ? { ...d, analysis: result, analyzing: false }
            : d,
        ),
      );
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d) =>
          d.document_id === docId ? { ...d, analyzing: false } : d,
        ),
      );
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
  }, []);

  const handleIngest = useCallback(async (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.document_id === docId ? { ...d, ingesting: true } : d,
      ),
    );
    try {
      await ingestDocument(docId);
      setDocuments((prev) =>
        prev.map((d) =>
          d.document_id === docId
            ? { ...d, ingesting: false, ingestSuccess: true }
            : d,
        ),
      );
      setTimeout(() => {
        setDocuments((prev) =>
          prev.map((d) =>
            d.document_id === docId ? { ...d, ingestSuccess: false } : d,
          ),
        );
      }, 3000);
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d) =>
          d.document_id === docId ? { ...d, ingesting: false } : d,
        ),
      );
      setError(err instanceof Error ? err.message : "Ingestion failed");
    }
  }, []);

  const handleCopyPreview = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 2000);
    }
  };

  const filtered = documents.filter((d) =>
    d.filename.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const selectedDoc = documents.find((d) => d.document_id === selected);

  return (
    <AppShell>
      <div className="flex h-full">
        {/* ── Left panel: Document list ──────────────────────────────── */}
        <div className="flex w-96 flex-col border-r border-[var(--color-wb-border)] bg-[var(--color-wb-surface)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-wb-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-wb-text)]">
                Documents
              </h2>
              {documents.length > 0 && (
                <span className="rounded-full bg-[var(--color-wb-bg-inset)] px-2 py-0.5 text-[10px] font-mono font-medium text-[var(--color-wb-text-secondary)] border border-[var(--color-wb-border-subtle)]">
                  {documents.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchDocuments}
                className="rounded-md p-1.5 text-[var(--color-wb-text-muted)] hover:bg-[var(--color-wb-surface-hover)] hover:text-[var(--color-wb-text)] transition-colors cursor-pointer"
                title="Refresh documents"
                aria-label="Refresh documents"
              >
                <RefreshCw size={14} className={cn(loading && "animate-spin-smooth")} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md bg-[var(--color-wb-accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-wb-accent-hover)] transition-colors cursor-pointer shadow-sm"
                title="Upload files"
              >
                <Upload size={13} />
                <span>Upload</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
                className="hidden"
              />
            </div>
          </div>

          {/* Search bar */}
          <div className="border-b border-[var(--color-wb-border)] px-3 py-2">
            <div className="relative flex items-center rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-bg)] px-2.5 py-1.5 focus-within:border-[var(--color-wb-accent)] transition-colors">
              <SearchIcon size={13} className="text-[var(--color-wb-text-muted)] shrink-0 mr-2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search documents by name..."
                className="flex-1 bg-transparent text-xs text-[var(--color-wb-text)] placeholder:text-[var(--color-wb-text-muted)] outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="text-[var(--color-wb-text-muted)] hover:text-[var(--color-wb-text)] p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* List & Drag area */}
          <div
            className={cn(
              "relative flex-1 overflow-y-auto",
              dragOver && "bg-[var(--color-wb-accent-subtle)]",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files) handleUpload(e.dataTransfer.files);
            }}
          >
            {/* Drag drop overlay */}
            {dragOver && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--color-wb-accent-subtle)]/90 border-2 border-dashed border-[var(--color-wb-accent)] pointer-events-none p-4 text-center">
                <Upload size={24} className="text-[var(--color-wb-accent)] mb-2 animate-bounce" />
                <span className="text-xs font-semibold text-[var(--color-wb-accent)]">
                  Drop documents to upload
                </span>
                <span className="text-[10px] text-[var(--color-wb-text-muted)] mt-0.5">
                  PDF, DOCX, TXT
                </span>
              </div>
            )}

            {/* Uploading indicator */}
            {uploading && (
              <div className="flex items-center gap-2 border-b border-[var(--color-wb-border)] bg-[var(--color-wb-accent-subtle)] px-4 py-2 text-xs text-[var(--color-wb-accent)] font-medium">
                <Loader2 size={13} className="animate-spin-smooth" />
                Uploading document...
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-xs text-[var(--color-wb-text-muted)] gap-2">
                <Loader2 size={18} className="animate-spin-smooth text-[var(--color-wb-accent)]" />
                <span>Loading documents...</span>
              </div>
            ) : error ? (
              <div className="m-3 flex items-start gap-2 rounded-lg bg-[var(--color-wb-error-bg)] border border-[var(--color-wb-error-border)] p-3 text-xs text-[var(--color-wb-error)]">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] mb-3">
                  <FileText size={18} className="text-[var(--color-wb-text-muted)]" />
                </div>
                <span className="text-xs font-semibold text-[var(--color-wb-text)]">
                  {searchTerm ? "No documents found" : "No documents yet"}
                </span>
                <p className="mt-1 text-[11px] text-[var(--color-wb-text-muted)] max-w-[200px]">
                  {searchTerm
                    ? "Try a different search query"
                    : "Upload files or drop them here to extract and analyze"}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)] transition-colors cursor-pointer"
                  >
                    <Upload size={12} />
                    Browse Files
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-wb-border)]">
                {filtered.map((doc) => {
                  const isSelected = selected === doc.document_id;
                  return (
                    <button
                      key={doc.document_id}
                      onClick={() => setSelected(doc.document_id)}
                      className={cn(
                        "group relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-[var(--color-wb-surface-active)]"
                          : "hover:bg-[var(--color-wb-surface-hover)]",
                      )}
                    >
                      {/* Selection accent bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--color-wb-accent)]" />
                      )}

                      <FileTypeBadge extension={doc.file_type} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-medium text-[var(--color-wb-text)]" title={doc.filename}>
                            {doc.filename}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-wb-text-muted)]">
                          <span>{formatBytes(doc.file_size)}</span>
                          <span>·</span>
                          <span>{doc.page_count} {doc.page_count === 1 ? "page" : "pages"}</span>
                          <span>·</span>
                          <StatusBadge status={doc.extraction_status} />
                        </div>
                      </div>

                      <ChevronRight
                        size={13}
                        className={cn(
                          "shrink-0 text-[var(--color-wb-text-muted)] transition-transform",
                          isSelected ? "translate-x-0.5 text-[var(--color-wb-accent)]" : "opacity-0 group-hover:opacity-100",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: Detail & Analysis ─────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-y-auto bg-[var(--color-wb-bg)]">
          {selectedDoc ? (
            <div className="mx-auto w-full max-w-3xl px-8 py-8 space-y-6">
              {/* Document Header Card */}
              <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <FileTypeBadge extension={selectedDoc.file_type} />
                    <div className="min-w-0">
                      <h1 className="text-base font-semibold text-[var(--color-wb-text)] truncate" title={selectedDoc.filename}>
                        {selectedDoc.filename}
                      </h1>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-[var(--color-wb-text-muted)]">
                        <span className="font-mono text-[11px]">{formatBytes(selectedDoc.file_size)}</span>
                        <span>·</span>
                        <span>{selectedDoc.page_count} {selectedDoc.page_count === 1 ? "page" : "pages"}</span>
                        <span>·</span>
                        <StatusBadge status={selectedDoc.extraction_status} />
                        <span>·</span>
                        <span>Uploaded {formatRelativeTime(selectedDoc.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(selectedDoc.document_id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-wb-text-muted)] hover:bg-[var(--color-wb-error-bg)] hover:text-[var(--color-wb-error)] transition-colors cursor-pointer"
                    title="Delete document"
                    aria-label="Delete document"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Actions Toolbar */}
                <div className="mt-5 flex items-center gap-2.5 border-t border-[var(--color-wb-border)] pt-4">
                  <button
                    onClick={() => handleAnalyze(selectedDoc.document_id)}
                    disabled={selectedDoc.analyzing}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-sm",
                      "bg-[var(--color-wb-accent)] text-white hover:bg-[var(--color-wb-accent-hover)]",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    {selectedDoc.analyzing ? (
                      <>
                        <Loader2 size={13} className="animate-spin-smooth" />
                        <span>Analyzing with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Analyze Document</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleIngest(selectedDoc.document_id)}
                    disabled={selectedDoc.ingesting}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)] transition-colors cursor-pointer",
                      selectedDoc.ingestSuccess && "border-[var(--color-wb-success-border)] text-[var(--color-wb-success)] bg-[var(--color-wb-success-bg)]",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    {selectedDoc.ingesting ? (
                      <>
                        <Loader2 size={13} className="animate-spin-smooth text-[var(--color-wb-accent)]" />
                        <span>Ingesting chunks...</span>
                      </>
                    ) : selectedDoc.ingestSuccess ? (
                      <>
                        <Check size={13} className="text-[var(--color-wb-success)]" />
                        <span>Ingested to RAG</span>
                      </>
                    ) : (
                      <>
                        <BookOpen size={13} />
                        <span>Ingest to Knowledge Base</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Analysis Results (if available) */}
              {selectedDoc.analysis && (
                <div className="space-y-4 animate-slide-up">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-wb-text-muted)]">
                      AI Analysis Results
                    </h3>
                  </div>

                  {/* Summary Card */}
                  <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-wb-text)] mb-2">
                      <FileCode size={14} className="text-[var(--color-wb-accent)]" />
                      Executive Summary
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--color-wb-text-secondary)] whitespace-pre-wrap">
                      {selectedDoc.analysis.summary}
                    </p>
                  </div>

                  {/* Key Findings Card */}
                  {selectedDoc.analysis.key_findings && selectedDoc.analysis.key_findings.length > 0 && (
                    <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-5 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-wb-text)] mb-3">
                        <Sparkles size={14} className="text-[var(--color-wb-accent)]" />
                        Key Findings
                      </div>
                      <ul className="space-y-2">
                        {selectedDoc.analysis.key_findings.map((f, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs text-[var(--color-wb-text-secondary)] leading-relaxed">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-wb-accent)] shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risks Card */}
                  {selectedDoc.analysis.risks && selectedDoc.analysis.risks.length > 0 && (
                    <div className="rounded-xl border border-[var(--color-wb-warning-border)] bg-[var(--color-wb-warning-bg)] p-5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-wb-warning)] mb-3">
                        <ShieldAlert size={14} />
                        Identified Risks & Concerns
                      </div>
                      <ul className="space-y-2">
                        {selectedDoc.analysis.risks.map((r, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs text-[var(--color-wb-warning)] leading-relaxed">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-wb-warning)] shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items Card */}
                  {selectedDoc.analysis.action_items && selectedDoc.analysis.action_items.length > 0 && (
                    <div className="rounded-xl border border-[var(--color-wb-success-border)] bg-[var(--color-wb-success-bg)] p-5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-wb-success)] mb-3">
                        <ListChecks size={14} />
                        Recommended Action Items
                      </div>
                      <ul className="space-y-2">
                        {selectedDoc.analysis.action_items.map((a, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs text-[var(--color-wb-success)] leading-relaxed">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-wb-success)] shrink-0" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Text Preview Card */}
              {selectedDoc.text_preview && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-wb-text-muted)]">
                      Extracted Text Content
                    </h3>
                    <button
                      onClick={() => handleCopyPreview(selectedDoc.text_preview || "")}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--color-wb-text-muted)] hover:text-[var(--color-wb-text)] transition-colors cursor-pointer"
                    >
                      {copiedPreview ? (
                        <>
                          <Check size={12} className="text-[var(--color-wb-success)]" />
                          <span className="text-[var(--color-wb-success)]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy text</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-4">
                    <pre className="font-mono text-xs leading-relaxed text-[var(--color-wb-text-secondary)] whitespace-pre-wrap max-h-80 overflow-y-auto">
                      {selectedDoc.text_preview}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] mb-3">
                <FileText size={22} className="text-[var(--color-wb-text-muted)]" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--color-wb-text)]">
                No document selected
              </h3>
              <p className="mt-1 text-xs text-[var(--color-wb-text-muted)] max-w-sm">
                Select a document from the left list to view extracted text, run AI analysis, or ingest it into RAG.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
