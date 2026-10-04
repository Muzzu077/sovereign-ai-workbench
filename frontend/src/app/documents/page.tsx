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
  ClipboardCheck,
  Download,
  FileCheck2,
  Layers,
  HardDrive,
  Cpu,
  LayoutGrid,
  List,
  Eye,
  FileSpreadsheet,
  FileBadge,
  ShieldCheck,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BackgroundGrid } from "@/components/ui/BackgroundGrid";
import { AnimatedTabs, type TabItem } from "@/components/ui/AnimatedTabs";
import { CountUp } from "@/components/ui/CountUp";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { StatusBadge } from "@/components/ui/StatusBadge";

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

function FileTypeIcon({ extension }: { extension: string }) {
  const ext = extension.toLowerCase();
  switch (ext) {
    case "pdf":
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 shrink-0 font-mono text-[10px] font-bold uppercase shadow-[0_0_12px_rgba(244,63,94,0.15)]">
          PDF
        </span>
      );
    case "docx":
    case "doc":
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shrink-0 font-mono text-[10px] font-bold uppercase shadow-[0_0_12px_rgba(6,182,212,0.15)]">
          DOC
        </span>
      );
    case "txt":
    case "md":
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0 font-mono text-[10px] font-bold uppercase shadow-[0_0_12px_rgba(16,185,129,0.15)]">
          TXT
        </span>
      );
    default:
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 shrink-0 font-mono text-[10px] font-bold uppercase shadow-[0_0_12px_rgba(99,102,241,0.15)]">
          {ext.slice(0, 3) || "DOC"}
        </span>
      );
  }
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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
              file_size: res.file_size,
              file_type: res.file_type,
              page_count: res.page_count,
              extraction_status: res.extraction_status,
              created_at: new Date().toISOString(),
              text_preview: res.text_preview,
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

  const handleDelete = useCallback(
    async (docId: string) => {
      try {
        await deleteFile(docId);
        setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
        if (selected === docId) setSelected(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [selected],
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
      setDetailTab("findings");
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

  const handleApproval = useCallback(async (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.document_id === docId
          ? { ...d, approvingNote: true, approvalStages: [], approvalFindings: undefined, approvalCitations: undefined }
          : d,
      ),
    );
    setDetailTab("approval");
    try {
      for await (const { event, data } of streamApprovalWorkflow(docId)) {
        const parsed = JSON.parse(data);
        if (event === "stage") {
          setDocuments((prev) =>
            prev.map((d) => {
              if (d.document_id !== docId) return d;
              const stages = [...(d.approvalStages || [])];
              // Update existing stage or add new one
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
  const totalBytes = documents.reduce((acc, d) => acc + d.file_size, 0);
  const completedCount = documents.filter((d) => d.extraction_status === "completed").length;

  const DETAIL_TABS: TabItem<DetailTab>[] = [
    { id: "findings", label: "Findings & Risk Matrix", icon: Sparkles },
    { id: "approval", label: "Executive Note & Workflow", icon: ClipboardCheck },
    { id: "preview", label: "Extracted Text Stream", icon: FileText },
  ];

  return (
    <AppShell>
      <div className="relative flex h-full flex-col bg-[#070a12] overflow-hidden">
        <BackgroundGrid variant="dots" opacity={0.04} />

        {/* ── Top Metric Banner ───────────────────────────────────────── */}
        <div className="border-b border-white/[0.08] bg-slate-950/70 backdrop-blur-xl px-6 py-4 z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  Document Intelligence Vault
                </h1>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold uppercase tracking-wider">
                  LOCAL SECURE PARSER
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Zero-egress local document ingestion, structural risk analysis, and automated briefing note synthesis.
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 bg-slate-900/80 border border-white/10 px-4 py-2 rounded-xl text-xs font-mono shadow-xs">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Vault Docs</span>
                  <span className="font-extrabold text-white text-sm">
                    <CountUp value={documents.length} duration={0.8} />
                  </span>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Extracted</span>
                  <span className="font-extrabold text-emerald-400 text-sm">
                    <CountUp value={completedCount} duration={0.8} />
                  </span>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Storage</span>
                  <span className="font-extrabold text-cyan-300 text-sm">{formatBytes(totalBytes)}</span>
                </div>
              </div>

              {/* Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-600 hover:from-cyan-400 hover:via-teal-400 hover:to-indigo-500 text-white text-xs font-bold shadow-[0_0_16px_rgba(6,182,212,0.3)] transition-all cursor-pointer border border-cyan-400/40"
              >
                <Upload size={14} strokeWidth={2.4} />
                <span>Upload Document</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* ── Main Dual-Pane Body ─────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── Left Document Index List ──────────────────────────────── */}
          <div className="flex w-[400px] shrink-0 flex-col border-r border-white/[0.08] bg-slate-950/60 backdrop-blur-xl">
            {/* Search and View Mode */}
            <div className="p-3 border-b border-white/[0.08] flex items-center gap-2 bg-slate-950/40">
              <div className="relative flex-1 flex items-center rounded-xl border border-white/10 bg-slate-900/80 px-3 py-1.5 focus-within:border-cyan-500/50 transition-all">
                <SearchIcon size={13} className="text-slate-400 shrink-0 mr-2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search vault documents..."
                  className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 outline-none font-medium"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="text-slate-400 hover:text-white">
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                onClick={fetchDocuments}
                className="p-2 rounded-xl border border-white/10 bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Refresh"
              >
                <RefreshCw size={13} className={cn(loading && "animate-spin-smooth")} />
              </button>
            </div>

            {/* Drag and Drop Zone */}
            <div
              className={cn(
                "relative flex-1 overflow-y-auto",
                dragOver && "bg-cyan-500/10 border-2 border-dashed border-cyan-400",
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
              {dragOver && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-cyan-950/80 backdrop-blur-md text-white p-4 text-center">
                  <Upload size={32} className="animate-bounce text-cyan-400 mb-2" />
                  <span className="text-xs font-bold">Drop files to ingest immediately</span>
                  <span className="text-[10px] text-cyan-200 mt-0.5 font-mono">PDF, DOCX, TXT supported</span>
                </div>
              )}

              {uploading && (
                <div className="flex items-center gap-2 p-3 bg-cyan-500/10 border-b border-cyan-500/30 text-xs text-cyan-300 font-semibold">
                  <Loader2 size={13} className="animate-spin-smooth text-cyan-400" />
                  <span>Parsing and vector indexing document...</span>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-400 gap-2">
                  <Loader2 size={20} className="animate-spin-smooth text-cyan-400" />
                  <span>Loading vault items...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 border border-white/10 mb-3 text-slate-500">
                    <FileText size={20} />
                  </div>
                  <span className="text-xs font-bold text-white">
                    {searchTerm ? "No matching files" : "Vault is empty"}
                  </span>
                  <p className="mt-1 text-[11px] text-slate-400 max-w-[220px]">
                    Drag and drop files here or click Upload to extract intelligence.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {filtered.map((doc) => {
                    const isSelected = selected === doc.document_id;
                    return (
                      <button
                        key={doc.document_id}
                        onClick={() => setSelected(doc.document_id)}
                        className={cn(
                          "group relative flex w-full items-start gap-3 p-3.5 text-left transition-all cursor-pointer",
                          isSelected
                            ? "bg-slate-900/90 border-l-2 border-l-cyan-400 shadow-[inset_0_0_12px_rgba(6,182,212,0.1)]"
                            : "hover:bg-slate-900/40",
                        )}
                      >
                        <FileTypeIcon extension={doc.file_type} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-bold text-slate-200 group-hover:text-white" title={doc.filename}>
                              {doc.filename}
                            </span>
                          </div>

                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span>{formatBytes(doc.file_size)}</span>
                            <span>·</span>
                            <span>{doc.page_count} {doc.page_count === 1 ? "page" : "pages"}</span>
                            <span>·</span>
                            <StatusBadge
                              status={doc.extraction_status === "completed" ? "success" : "warning"}
                              label={doc.extraction_status}
                              size="sm"
                            />
                          </div>
                        </div>

                        <ChevronRight
                          size={14}
                          className={cn(
                            "shrink-0 mt-2 text-slate-500 transition-transform",
                            isSelected ? "text-cyan-400 translate-x-0.5" : "opacity-0 group-hover:opacity-100",
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Document Intelligence Inspector ───────────────────── */}
          <div className="flex flex-1 flex-col overflow-y-auto bg-[#070a12]">
            {selectedDoc ? (
              <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
                {/* Document Header Card */}
                <div className="rounded-2xl border border-white/[0.08] bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <FileTypeIcon extension={selectedDoc.file_type} />
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-white truncate" title={selectedDoc.filename}>
                          {selectedDoc.filename}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-400 font-mono">
                          <span>{formatBytes(selectedDoc.file_size)}</span>
                          <span>·</span>
                          <span>{selectedDoc.page_count} pages</span>
                          <span>·</span>
                          <StatusBadge
                            status={selectedDoc.extraction_status === "completed" ? "success" : "warning"}
                            label={`Extraction: ${selectedDoc.extraction_status}`}
                            size="sm"
                          />
                          <span>·</span>
                          <span>Uploaded {formatRelativeTime(selectedDoc.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(selectedDoc.document_id)}
                      className="p-2 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete document"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Primary Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-white/[0.06]">
                    <ShimmerButton
                      onClick={() => handleAnalyze(selectedDoc.document_id)}
                      loading={selectedDoc.analyzing}
                      variant="primary"
                      size="sm"
                    >
                      <Sparkles size={13} />
                      <span>{selectedDoc.analysis ? "Re-Analyze Document" : "Extract AI Findings"}</span>
                    </ShimmerButton>

                    <button
                      onClick={() => handleIngest(selectedDoc.document_id)}
                      disabled={selectedDoc.ingesting}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer shadow-xs",
                        selectedDoc.ingestSuccess && "border-emerald-500/40 text-emerald-300 bg-emerald-950/40",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {selectedDoc.ingesting ? (
                        <>
                          <Loader2 size={13} className="animate-spin-smooth text-cyan-400" />
                          <span>Embedding into Vector Store...</span>
                        </>
                      ) : selectedDoc.ingestSuccess ? (
                        <>
                          <Check size={13} className="text-emerald-400" />
                          <span>Ingested into RAG Index</span>
                        </>
                      ) : (
                        <>
                          <BookOpen size={13} className="text-cyan-400" />
                          <span>Ingest to Vector Index</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleApproval(selectedDoc.document_id)}
                      disabled={selectedDoc.approvingNote}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer shadow-xs",
                        selectedDoc.approvalResult && "border-emerald-500/40 text-emerald-300 bg-emerald-950/40",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {selectedDoc.approvingNote ? (
                        <>
                          <Loader2 size={13} className="animate-spin-smooth text-cyan-400" />
                          <span>Synthesizing DOCX note...</span>
                        </>
                      ) : (
                        <>
                          <ClipboardCheck size={13} className="text-indigo-400" />
                          <span>Generate Approval Note</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sub-Tabs: Findings vs Approval Note vs Preview */}
                <div className="space-y-4">
                  <AnimatedTabs
                    tabs={DETAIL_TABS}
                    activeTab={detailTab}
                    onChange={(id) => setDetailTab(id)}
                    size="sm"
                  />

                  {/* ── Tab 1: Findings & Risk Matrix ─────────────────────── */}
                  {detailTab === "findings" && (
                    <div className="space-y-4 animate-fade-in">
                      {selectedDoc.analysis ? (
                        <div className="space-y-4">
                          {/* Summary */}
                          <SpotlightCard className="p-5 space-y-2" spotlightColor="rgba(6, 182, 212, 0.12)">
                            <div className="flex items-center gap-2 text-xs font-bold text-white">
                              <FileCode size={14} className="text-cyan-400" />
                              <span>Executive Abstract</span>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                              {selectedDoc.analysis.summary}
                            </p>
                          </SpotlightCard>

                          {/* Key Findings */}
                          {selectedDoc.analysis.key_findings.length > 0 && (
                            <SpotlightCard className="p-5 space-y-3" spotlightColor="rgba(6, 182, 212, 0.12)">
                              <div className="flex items-center gap-2 text-xs font-bold text-white">
                                <Sparkles size={14} className="text-cyan-400" />
                                <span>Key Observations ({selectedDoc.analysis.key_findings.length})</span>
                              </div>
                              <ul className="space-y-2">
                                {selectedDoc.analysis.key_findings.map((f, i) => (
                                  <li key={i} className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
                                    <span>{f}</span>
                                  </li>
                                ))}
                              </ul>
                            </SpotlightCard>
                          )}

                          {/* Risks */}
                          {selectedDoc.analysis.risks.length > 0 && (
                            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-3 shadow-lg">
                              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                                <ShieldAlert size={15} />
                                <span>Identified Security & Compliance Risks ({selectedDoc.analysis.risks.length})</span>
                              </div>
                              <ul className="space-y-2">
                                {selectedDoc.analysis.risks.map((r, i) => (
                                  <li key={i} className="flex items-start gap-2.5 text-xs text-amber-200/90 leading-relaxed">
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Action Items */}
                          {selectedDoc.analysis.action_items.length > 0 && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-3 shadow-lg">
                              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                                <ListChecks size={15} />
                                <span>Recommended Action Checklist</span>
                              </div>
                              <ul className="space-y-2">
                                {selectedDoc.analysis.action_items.map((a, i) => (
                                  <li key={i} className="flex items-start gap-2.5 text-xs text-emerald-200/90 leading-relaxed">
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                    <span>{a}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-12 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40">
                          <Sparkles size={24} className="text-cyan-400 mx-auto mb-2 opacity-60" />
                          <h4 className="text-xs font-bold text-white">
                            No AI analysis generated yet
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                            Click &quot;Extract AI Findings&quot; above to synthesize executive summaries, risk matrices, and action items locally.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Tab 2: Approval Note Workflow ─────────────────────── */}
                  {detailTab === "approval" && (
                    <div className="space-y-4 animate-fade-in">
                      {/* Live pipeline stages (shown during streaming AND after completion) */}
                      {((selectedDoc.approvalStages && selectedDoc.approvalStages.length > 0) || selectedDoc.approvalResult) && (
                        <div className="p-4 rounded-2xl border border-white/[0.08] bg-slate-900/60 space-y-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            {selectedDoc.approvingNote ? "Live Pipeline Progress" : "Automated Pipeline Verification"}
                          </span>
                          <div className="space-y-1.5">
                            {(selectedDoc.approvalResult?.steps || selectedDoc.approvalStages || []).map((step, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  {step.status === "running" ? (
                                    <Loader2 size={10} className="animate-spin-smooth text-cyan-400" />
                                  ) : step.status === "completed" ? (
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                                  ) : (
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
                                  )}
                                  <span className="text-slate-200">{step.step.replace(/_/g, " ")}</span>
                                  {typeof (step as Record<string, unknown>).message === "string" && (
                                    <span className="text-[10px] text-slate-500 ml-1">{String((step as Record<string, unknown>).message)}</span>
                                  )}
                                </div>
                                {step.elapsed_ms != null && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {step.elapsed_ms}ms
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Citations (from streaming or final result) */}
                      {(selectedDoc.approvalCitations || selectedDoc.approvalResult?.citations)?.length ? (
                        <SpotlightCard className="p-4 space-y-2" spotlightColor="rgba(6, 182, 212, 0.12)">
                          <div className="flex items-center gap-2 text-xs font-bold text-white">
                            <Layers size={13} className="text-cyan-400" />
                            <span>Source Citations ({(selectedDoc.approvalCitations || selectedDoc.approvalResult?.citations)?.length})</span>
                          </div>
                          <div className="space-y-1.5">
                            {(selectedDoc.approvalCitations || selectedDoc.approvalResult?.citations || []).map((c, i) => (
                              <div key={i} className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5 last:border-0">
                                <div className="flex items-center gap-2 text-slate-300">
                                  <FileText size={11} className="text-cyan-400/70 shrink-0" />
                                  <span className="truncate max-w-[200px]">{c.filename}</span>
                                  {c.page && <span className="text-[10px] text-slate-500">p.{c.page}</span>}
                                  {c.section && <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{c.section}</span>}
                                </div>
                                <span className={cn(
                                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                                  c.relevance_score >= 0.3 ? "bg-emerald-500/15 text-emerald-300" :
                                  c.relevance_score >= 0.1 ? "bg-yellow-500/15 text-yellow-300" :
                                  "bg-slate-700 text-slate-400",
                                )}>
                                  {(c.relevance_score * 100).toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </SpotlightCard>
                      ) : null}

                      {/* Extracted Findings (from streaming or final result) */}
                      {(selectedDoc.approvalFindings || selectedDoc.approvalResult?.findings) && (
                        <SpotlightCard className="p-4 space-y-2" spotlightColor="rgba(6, 182, 212, 0.12)">
                          <div className="flex items-center gap-2 text-xs font-bold text-white">
                            <Sparkles size={13} className="text-indigo-400" />
                            <span>LLM-Extracted Key Findings</span>
                          </div>
                          <div className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                            {selectedDoc.approvalFindings || selectedDoc.approvalResult?.findings}
                          </div>
                        </SpotlightCard>
                      )}

                      {/* Final result section */}
                      {selectedDoc.approvalResult ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex items-center gap-2">
                              <ShieldCheck size={14} className="text-emerald-400" />
                              <span>Generated Official Briefing Note</span>
                              <span className="text-[10px] font-mono text-slate-500 ml-1">
                                via {selectedDoc.approvalResult.model}
                              </span>
                            </span>
                            <a
                              href={downloadApprovalNote(selectedDoc.document_id)}
                              download
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all"
                            >
                              <Download size={13} />
                              <span>Download .DOCX Note</span>
                            </a>
                          </div>

                          {/* Markdown Preview */}
                          <div className="p-5 rounded-2xl border border-white/[0.08] bg-slate-950/80 font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto shadow-inner">
                            {selectedDoc.approvalResult.note_markdown}
                          </div>
                        </div>
                      ) : !selectedDoc.approvingNote ? (
                        <div className="p-12 text-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40">
                          <ClipboardCheck size={24} className="text-cyan-400 mx-auto mb-2 opacity-60" />
                          <h4 className="text-xs font-bold text-white">
                            No approval note created
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                            Click &quot;Generate Approval Note&quot; to execute the multi-step sovereign synthesis pipeline with live progress tracking.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* ── Tab 3: Extracted Text Preview ─────────────────────── */}
                  {detailTab === "preview" && (
                    <div className="space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          Raw Extracted Character Stream
                        </span>
                        <button
                          onClick={() => handleCopyPreview(selectedDoc.text_preview || "")}
                          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedPreview ? (
                            <>
                              <Check size={12} className="text-emerald-400" />
                              <span className="text-emerald-400 font-bold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy stream</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="p-4 rounded-2xl border border-white/[0.08] bg-slate-950/90 font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap max-h-[500px] overflow-y-auto select-text shadow-inner">
                        {selectedDoc.text_preview || "No preview text available."}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <FileCheck2 size={36} className="text-cyan-400 mb-3 opacity-60" />
                <h3 className="text-base font-bold text-white">
                  Select a document to inspect
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Choose a document from the left vault or upload a new file.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
