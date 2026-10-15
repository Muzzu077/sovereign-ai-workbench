"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/shell/AppShell";
import {
  listFiles,
  uploadFile,
  deleteFile,
  analyzeDocument,
  ingestDocument,
  streamApprovalWorkflow,
  downloadApprovalNote,
} from "@/lib/api/client";
import type { FileInfo, AnalysisResult, ApprovalNoteResult, ApprovalNoteCitation } from "@/lib/api/types";
import { cn, formatBytes, formatRelativeTime, copyToClipboard } from "@/lib/utils";
import {
  UploadCloud,
  Plus,
  Trash2,
  FileText,
  Search,
  BookOpen,
  Loader2,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  ClipboardCheck,
  Download,
  FolderOpen,
  X,
  FileCode2,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";

interface DocumentWithAnalysis extends FileInfo {
  analysis?: AnalysisResult;
  analyzing?: boolean;
  ingesting?: boolean;
  ingestSuccess?: boolean;
  approvalResult?: ApprovalNoteResult;
  approvingNote?: boolean;
  approvalStages?: Array<{ step: string; status: string; elapsed_ms?: number; message?: string }>;
  approvalFindings?: string;
  approvalCitations?: ApprovalNoteCitation[];
}

type DetailTab = "findings" | "approval" | "preview";

function EmptyState({ icon: Icon, title, description }: { icon: typeof FolderOpen; title: string; description: string }) {
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

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("findings");
  const [copiedPreview, setCopiedPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listFiles();
      setDocuments(response.files.map((f) => ({ ...f })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        for (const f of arr) {
          const res = await uploadFile(f);
          setDocuments((prev) => [
            {
              document_id: res.document_id,
              filename: res.filename,
              file_type: res.file_type,
              file_size: res.file_size,
              page_count: res.page_count,
              text_preview: res.text_preview,
              extraction_status: res.extraction_status,
              created_at: new Date().toISOString(),
            },
            ...prev,
          ]);
          setSelected(res.document_id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const handleDelete = useCallback(async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document from the vault?")) return;
    try {
      await deleteFile(docId);
      setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
      setSelected((curr) => (curr === docId ? null : curr));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    }
  }, []);

  const handleAnalyze = useCallback(async (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.document_id === docId ? { ...d, analyzing: true } : d)),
    );
    try {
      const res = await analyzeDocument(docId);
      setDocuments((prev) =>
        prev.map((d) =>
          d.document_id === docId ? { ...d, analysis: res, analyzing: false } : d,
        ),
      );
      setDetailTab("findings");
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d) => (d.document_id === docId ? { ...d, analyzing: false } : d)),
      );
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
  }, []);

  const handleIngest = useCallback(async (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.document_id === docId ? { ...d, ingesting: true } : d)),
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
          prev.map((d) => (d.document_id === docId ? { ...d, ingestSuccess: false } : d)),
        );
      }, 4000);
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d) => (d.document_id === docId ? { ...d, ingesting: false } : d)),
      );
      setError(err instanceof Error ? err.message : "Ingest failed");
    }
  }, []);

  const handleApproval = useCallback(async (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.document_id === docId
          ? {
              ...d,
              approvingNote: true,
              approvalStages: [],
              approvalFindings: undefined,
              approvalCitations: undefined,
              approvalResult: undefined,
            }
          : d,
      ),
    );
    setDetailTab("approval");

    try {
      for await (const { event, data } of streamApprovalWorkflow(docId, "Analyze for compliance & risks")) {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;

        if (event === "stage") {
          setDocuments((prev) =>
            prev.map((d) => {
              if (d.document_id !== docId) return d;
              const stages = [...(d.approvalStages || [])];
              const idx = stages.findIndex((s) => s.step === parsed.step);
              if (idx >= 0) {
                stages[idx] = parsed;
              } else {
                stages.push(parsed);
              }
              return { ...d, approvalStages: stages };
            }),
          );
        } else if (event === "citations") {
          setDocuments((prev) =>
            prev.map((d) =>
              d.document_id === docId
                ? { ...d, approvalCitations: parsed.citations }
                : d,
            ),
          );
        } else if (event === "findings") {
          setDocuments((prev) =>
            prev.map((d) =>
              d.document_id === docId
                ? { ...d, approvalFindings: parsed.findings }
                : d,
            ),
          );
        } else if (event === "complete") {
          setDocuments((prev) =>
            prev.map((d) =>
              d.document_id === docId
                ? { ...d, approvalResult: parsed as ApprovalNoteResult, approvingNote: false }
                : d,
            ),
          );
        } else if (event === "error") {
          setDocuments((prev) =>
            prev.map((d) =>
              d.document_id === docId ? { ...d, approvingNote: false } : d,
            ),
          );
          setError(parsed.message || "Approval workflow failed");
        }
      }
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d) =>
          d.document_id === docId ? { ...d, approvingNote: false } : d,
        ),
      );
      setError(err instanceof Error ? err.message : "Approval workflow failed");
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
      <main className="mx-auto max-w-[1420px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {/* Page Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
              <FileText className="size-3.5" /> LOCAL LIBRARY / 01
            </div>
            <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl text-foreground">
              Documents
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Prepare confidential files for local analysis and retrieval.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  <span>Add files</span>
                </>
              )}
            </button>
            <button
              onClick={fetchDocuments}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-panel text-xs text-muted-foreground hover:text-foreground hover:bg-panel-hover transition-colors"
              title="Refresh vault"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Status Line */}
        <div className="mb-7 flex items-center gap-2 border-y border-border py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          LOCAL RUNTIME CONNECTED
          <span className="mx-2 text-faint">/</span>
          {documents.length} DOCUMENT{documents.length === 1 ? "" : "S"} INDEXED
          <span className="mx-2 text-faint">/</span>
          ZERO EGRESS
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

        {/* Dual Pane Layout */}
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          {/* Main List Area */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium">
                Library <span className="ml-1 text-muted-foreground">{documents.length} local selection{documents.length === 1 ? "" : "s"}</span>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter vault documents..."
                  className="h-9 w-full rounded border border-border bg-panel pl-9 pr-3 text-xs outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center border border-border bg-panel/35 py-16 text-xs text-muted-foreground gap-2">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span>Loading vault documents...</span>
              </div>
            ) : filtered.length ? (
              <div className="border border-border bg-panel/30">
                {filtered.map((file) => {
                  const isSelected = selected === file.document_id;
                  return (
                    <div
                      key={file.document_id}
                      onClick={() => setSelected(file.document_id)}
                      className={cn(
                        "flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0 cursor-pointer transition-colors",
                        isSelected ? "bg-accent/60" : "hover:bg-panel-hover",
                      )}
                    >
                      <FileText className="size-5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {file.filename}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground flex flex-wrap items-center gap-2">
                          <span>{formatBytes(file.file_size)}</span>
                          <span>·</span>
                          <span>{file.page_count} {file.page_count === 1 ? "page" : "pages"}</span>
                          <span>·</span>
                          <span className="uppercase text-primary font-semibold">{file.extraction_status}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleAnalyze(file.document_id)}
                          disabled={file.analyzing}
                          title="Extract AI Findings"
                          className="px-2.5 py-1 rounded border border-border bg-panel text-[11px] font-medium text-foreground hover:border-primary/50 transition-colors"
                        >
                          {file.analyzing ? <Loader2 className="size-3 animate-spin inline" /> : "Analyze"}
                        </button>
                        <button
                          onClick={() => handleDelete(file.document_id)}
                          aria-label={`Remove ${file.filename}`}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) handleUpload(e.dataTransfer.files);
                }}
              >
                <EmptyState
                  icon={FolderOpen}
                  title="No documents in vault"
                  description="Add PDF, DOCX, or TXT files to preview your library. Processing and indexing run 100% on local hardware."
                />
              </div>
            )}

            {/* Selected Document Details Card */}
            {selectedDoc && (
              <div className="border border-border bg-panel p-6 space-y-5 rounded-md mt-6">
                <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded border border-border bg-muted/40">
                      <FileText className="size-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{selectedDoc.filename}</h3>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {formatBytes(selectedDoc.file_size)} · {selectedDoc.page_count} pages · Uploaded {formatRelativeTime(selectedDoc.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleIngest(selectedDoc.document_id)}
                      disabled={selectedDoc.ingesting}
                      className="px-3 py-1.5 rounded border border-border bg-panel text-xs font-medium text-foreground hover:border-primary/50 transition-colors flex items-center gap-1.5"
                    >
                      {selectedDoc.ingesting ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Indexing...</span>
                        </>
                      ) : selectedDoc.ingestSuccess ? (
                        <>
                          <Check className="size-3 text-primary" />
                          <span>Indexed</span>
                        </>
                      ) : (
                        <>
                          <BookOpen className="size-3 text-primary" />
                          <span>Vector Index</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleApproval(selectedDoc.document_id)}
                      disabled={selectedDoc.approvingNote}
                      className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                    >
                      {selectedDoc.approvingNote ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Synthesizing...</span>
                        </>
                      ) : (
                        <>
                          <ClipboardCheck className="size-3" />
                          <span>Generate Note</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sub Tab Buttons */}
                <div className="flex items-center gap-1 border-b border-border pb-2 text-xs font-mono">
                  <button
                    onClick={() => setDetailTab("findings")}
                    className={cn(
                      "px-3 py-1 rounded transition-colors",
                      detailTab === "findings" ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    FINDINGS & RISKS
                  </button>
                  <button
                    onClick={() => setDetailTab("approval")}
                    className={cn(
                      "px-3 py-1 rounded transition-colors",
                      detailTab === "approval" ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    EXECUTIVE NOTE
                  </button>
                  <button
                    onClick={() => setDetailTab("preview")}
                    className={cn(
                      "px-3 py-1 rounded transition-colors",
                      detailTab === "preview" ? "bg-accent text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    TEXT PREVIEW
                  </button>
                </div>

                {/* Tab 1: Findings */}
                {detailTab === "findings" && (
                  <div className="space-y-4 pt-1">
                    {selectedDoc.analysis ? (
                      <div className="space-y-4">
                        <div className="border border-border p-4 bg-muted/20 rounded">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                            EXECUTIVE SUMMARY
                          </div>
                          <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                            {selectedDoc.analysis.summary}
                          </p>
                        </div>

                        {selectedDoc.analysis.key_findings && (
                          <div className="border border-border p-4 bg-muted/20 rounded">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                              KEY FINDINGS ({selectedDoc.analysis.key_findings.length})
                            </div>
                            <ul className="space-y-2">
                              {selectedDoc.analysis.key_findings.map((f, i) => (
                                <li key={i} className="text-xs text-foreground flex items-start gap-2">
                                  <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                  <span>{f}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {selectedDoc.analysis.risks && selectedDoc.analysis.risks.length > 0 && (
                          <div className="border border-warning/40 bg-warning/5 p-4 rounded">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-warning mb-2">
                              RISK FACTORS IDENTIFIED ({selectedDoc.analysis.risks.length})
                            </div>
                            <ul className="space-y-1.5">
                              {selectedDoc.analysis.risks.map((r, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                                  <span className="size-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 text-center border border-dashed border-border text-xs text-muted-foreground">
                        No analysis generated yet. Click &quot;Analyze&quot; above to run structural analysis.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Approval Note */}
                {detailTab === "approval" && (
                  <div className="space-y-4 pt-1">
                    {selectedDoc.approvingNote && (
                      <div className="border border-border p-4 bg-muted/20 rounded space-y-2">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-primary flex items-center gap-2">
                          <Loader2 className="size-3 animate-spin" /> SYNTHESIZING APPROVAL NOTE...
                        </div>
                        {selectedDoc.approvalStages?.map((stage, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                            <span>{stage.step}</span>
                            <span>{stage.status}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedDoc.approvalResult ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase text-primary">SYNTHESIS COMPLETE</span>
                          <button
                            onClick={() => downloadApprovalNote(selectedDoc.document_id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-panel text-xs font-semibold hover:border-primary/50 text-foreground transition-colors"
                          >
                            <Download className="size-3.5" />
                            <span>Download DOCX</span>
                          </button>
                        </div>
                        <div className="border border-border p-4 bg-muted/20 rounded font-mono text-xs leading-relaxed whitespace-pre-wrap">
                          {selectedDoc.approvalResult.note_markdown || selectedDoc.approvalFindings}
                        </div>
                      </div>
                    ) : !selectedDoc.approvingNote && (
                      <div className="p-8 text-center border border-dashed border-border text-xs text-muted-foreground">
                        No executive note synthesized. Click &quot;Generate Note&quot; to synthesize an evidence-grounded briefing note.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Text Preview */}
                {detailTab === "preview" && (
                  <div className="space-y-3 pt-1">
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleCopyPreview(selectedDoc.text_preview || "")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-panel text-xs text-muted-foreground hover:text-foreground"
                      >
                        {copiedPreview ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
                        <span>{copiedPreview ? "Copied" : "Copy preview"}</span>
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto border border-border bg-background p-4 rounded font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                      {selectedDoc.text_preview || "No text preview available."}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Pipeline Aside (matches workbench-pages.tsx) */}
          <div className="space-y-4">
            <div className="border border-border bg-panel p-5">
              <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                PROCESSING PIPELINE
              </div>
              {["Upload & validate", "Extract / OCR", "Chunk & index", "Available for retrieval"].map((step, i) => (
                <div key={step} className="flex gap-3 pb-6 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="grid size-6 place-items-center rounded-full border border-border font-mono text-[10px] text-muted-foreground">
                      {i + 1}
                    </span>
                    {i < 3 && <span className="mt-1 h-full w-px bg-border" />}
                  </div>
                  <div className="pt-1 text-xs text-muted-foreground">{step}</div>
                </div>
              ))}
            </div>

            <div className="border border-border bg-panel p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                VAULT SPECIFICATIONS
              </div>
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Formats</span>
                  <span className="font-mono font-medium">PDF, DOCX, TXT</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Parser</span>
                  <span className="font-mono font-medium">Local PyMuPDF</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Boundary</span>
                  <span className="font-mono font-medium text-primary">Air-Gapped</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
