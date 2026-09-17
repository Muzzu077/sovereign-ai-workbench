"use client";

import { useEffect, useState, useCallback, useRef, type DragEvent, type ChangeEvent } from "react";
import {
  listFiles,
  uploadFile,
  deleteFile,
  analyzeDocument,
  type FileListResponse,
  type FileInfo,
  type AnalysisResult,
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeBadgeStyle(type: string): string {
  switch (type) {
    case "pdf":
      return "bg-accent-red/15 text-accent-red";
    case "docx":
      return "bg-accent-blue/15 text-accent-blue";
    case "txt":
      return "bg-accent-green/15 text-accent-green";
    default:
      return "bg-text-muted/15 text-text-muted";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  // -- File list state -------------------------------------------------------
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -- Upload state ----------------------------------------------------------
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Expanded row / analysis state -----------------------------------------
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});

  // -- Delete state ----------------------------------------------------------
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // -- Fetch files -----------------------------------------------------------
  const fetchFiles = useCallback(async () => {
    try {
      const data: FileListResponse = await listFiles();
      setFiles(data.files);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`API error ${err.status}: ${err.statusText}`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load files");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // -- Upload handler --------------------------------------------------------
  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        await uploadFile(file);
        await fetchFiles();
      } catch (err) {
        if (err instanceof ApiError) {
          setUploadError(`Upload failed (${err.status}): ${err.statusText}`);
        } else {
          setUploadError(err instanceof Error ? err.message : "Upload failed");
        }
      } finally {
        setUploading(false);
      }
    },
    [fetchFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleUpload],
  );

  // -- Analyze handler -------------------------------------------------------
  const handleAnalyze = useCallback(async (documentId: string) => {
    setAnalyzingIds((prev) => new Set(prev).add(documentId));
    setAnalysisErrors((prev) => {
      const next = { ...prev };
      delete next[documentId];
      return next;
    });
    try {
      const result = await analyzeDocument(documentId);
      setAnalyses((prev) => ({ ...prev, [documentId]: result }));
      setExpandedId(documentId);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `Analysis failed (${err.status})`
          : err instanceof Error
            ? err.message
            : "Analysis failed";
      setAnalysisErrors((prev) => ({ ...prev, [documentId]: msg }));
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  }, []);

  // -- Delete handler --------------------------------------------------------
  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeletingIds((prev) => new Set(prev).add(documentId));
      try {
        await deleteFile(documentId);
        setFiles((prev) => prev.filter((f) => f.document_id !== documentId));
        if (expandedId === documentId) setExpandedId(null);
        setConfirmDeleteId(null);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? `Delete failed (${err.status})`
            : "Delete failed";
        setError(msg);
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      }
    },
    [expandedId],
  );

  // -- Toggle row expansion ---------------------------------------------------
  const toggleRow = useCallback(
    (documentId: string) => {
      setExpandedId((prev) => (prev === documentId ? null : documentId));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state (full page)
  // -------------------------------------------------------------------------
  if (error && files.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-accent-red">{error}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            setError(null);
            fetchFiles();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">Documents</h1>
        <p className="text-xs text-text-muted">
          Upload, browse, and analyze documents
        </p>
      </div>

      {/* ── Upload Section ─────────────────────────────────────────────── */}
      <Panel title="Upload Document" subtitle="Drag and drop or browse files">
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors ${
            dragOver
              ? "border-accent-blue/50 bg-accent-blue/5"
              : "border-border-secondary hover:border-accent-blue/50"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Spinner className="h-6 w-6" />
              <p className="text-sm text-text-secondary">Uploading...</p>
            </div>
          ) : (
            <>
              <svg
                className="h-8 w-8 text-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                />
              </svg>
              <p className="text-sm text-text-secondary">
                Drop a file here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-medium text-accent-blue underline underline-offset-2 hover:text-accent-blue/80"
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-text-muted">
                Supports PDF, DOCX, and TXT files
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={onFileInputChange}
          />
        </div>
        {uploadError && (
          <p className="mt-3 text-xs text-accent-red">{uploadError}</p>
        )}
      </Panel>

      {/* ── Inline error banner (non-fatal) ────────────────────────────── */}
      {error && files.length > 0 && (
        <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-2.5 text-xs text-accent-red">
          {error}
        </div>
      )}

      {/* ── File List ──────────────────────────────────────────────────── */}
      <Panel
        title="Documents"
        subtitle={`${files.length} document${files.length === 1 ? "" : "s"}`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchFiles();
            }}
          >
            Refresh
          </Button>
        }
      >
        {files.length === 0 ? (
          <EmptyState
            title="No documents"
            description="Upload a document above to get started."
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
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-primary text-xs uppercase tracking-wider text-text-muted">
                  <th className="pb-2 pr-4 font-medium">Filename</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Size</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Pages</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-secondary">
                {files.map((file) => {
                  const isExpanded = expandedId === file.document_id;
                  const analysis = analyses[file.document_id];
                  const isAnalyzing = analyzingIds.has(file.document_id);
                  const analysisError = analysisErrors[file.document_id];
                  const isDeleting = deletingIds.has(file.document_id);
                  const isConfirmingDelete =
                    confirmDeleteId === file.document_id;

                  return (
                    <tr key={file.document_id} className="group">
                      <td colSpan={6} className="p-0">
                        {/* Main row */}
                        <div
                          className={`flex cursor-pointer items-center transition-colors hover:bg-bg-hover ${
                            isExpanded ? "bg-bg-hover/50" : ""
                          }`}
                          onClick={() => toggleRow(file.document_id)}
                        >
                          <div className="flex-1 py-2.5 pr-4 font-medium text-text-primary">
                            <div className="flex items-center gap-2">
                              <svg
                                className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${
                                  isExpanded ? "rotate-90" : ""
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                                />
                              </svg>
                              <span className="truncate">{file.filename}</span>
                            </div>
                          </div>
                          <div className="py-2.5 pr-4">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase ${fileTypeBadgeStyle(file.file_type)}`}
                            >
                              {file.file_type}
                            </span>
                          </div>
                          <div className="py-2.5 pr-4 text-text-secondary">
                            {formatFileSize(file.file_size)}
                          </div>
                          <div className="py-2.5 pr-4">
                            <StatusBadge status={file.extraction_status} />
                          </div>
                          <div className="py-2.5 pr-4 text-text-secondary">
                            {file.page_count}
                          </div>
                          <div
                            className="flex items-center justify-end gap-2 py-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="primary"
                              size="sm"
                              loading={isAnalyzing}
                              onClick={() => handleAnalyze(file.document_id)}
                              disabled={isAnalyzing}
                            >
                              Analyze
                            </Button>
                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="danger"
                                  size="sm"
                                  loading={isDeleting}
                                  onClick={() =>
                                    handleDelete(file.document_id)
                                  }
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
                                onClick={() =>
                                  setConfirmDeleteId(file.document_id)
                                }
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Expanded detail panel */}
                        {isExpanded && (
                          <div className="border-t border-border-secondary bg-bg-tertiary/50 px-5 py-4 space-y-4">
                            {/* Text preview */}
                            {file.text_preview && (
                              <div>
                                <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                                  Text Preview
                                </h4>
                                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-bg-primary border border-border-secondary p-3 text-xs text-text-secondary font-mono">
                                  {file.text_preview}
                                </pre>
                              </div>
                            )}

                            {/* Upload date */}
                            <div className="text-xs text-text-muted">
                              Uploaded:{" "}
                              <span className="text-text-secondary">
                                {new Date(file.uploaded_at).toLocaleString()}
                              </span>
                            </div>

                            {/* Analysis error */}
                            {analysisError && (
                              <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
                                {analysisError}
                              </div>
                            )}

                            {/* Analysis result */}
                            {analysis && (
                              <div className="space-y-3 rounded-lg border border-border-primary bg-bg-secondary p-4">
                                <h4 className="text-sm font-semibold text-text-primary">
                                  Analysis Result
                                </h4>

                                {/* Summary */}
                                <div>
                                  <h5 className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
                                    Summary
                                  </h5>
                                  <p className="text-sm text-text-secondary leading-relaxed">
                                    {analysis.summary}
                                  </p>
                                </div>

                                {/* Key Findings */}
                                {analysis.key_findings.length > 0 && (
                                  <div>
                                    <h5 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-accent-blue">
                                      Key Findings
                                    </h5>
                                    <ul className="space-y-1">
                                      {analysis.key_findings.map(
                                        (finding, i) => (
                                          <li
                                            key={i}
                                            className="flex items-start gap-2 text-sm text-text-secondary"
                                          >
                                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
                                            {finding}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                )}

                                {/* Risks */}
                                {analysis.risks.length > 0 && (
                                  <div>
                                    <h5 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-accent-amber">
                                      Risks
                                    </h5>
                                    <ul className="space-y-1">
                                      {analysis.risks.map((risk, i) => (
                                        <li
                                          key={i}
                                          className="flex items-start gap-2 text-sm text-text-secondary"
                                        >
                                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-amber" />
                                          {risk}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Action Items */}
                                {analysis.action_items.length > 0 && (
                                  <div>
                                    <h5 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-accent-green">
                                      Action Items
                                    </h5>
                                    <ul className="space-y-1">
                                      {analysis.action_items.map(
                                        (item, i) => (
                                          <li
                                            key={i}
                                            className="flex items-start gap-2 text-sm text-text-secondary"
                                          >
                                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green" />
                                            {item}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
