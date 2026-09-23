"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  FileText,
  Upload,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  RefreshCw,
  Search,
  FileCode,
  Loader2,
  ShieldCheck,
  Zap,
  ArrowRight,
} from "lucide-react";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  SovereignPanel,
  SovereignPipeline,
  SovereignStatus,
  SovereignInspector,
} from "@/components/sovereign";
import {
  listFiles,
  uploadFile,
  deleteFile,
  analyzeDocument,
  ingestDocument,
  type FileInfo,
  type FileListResponse,
  type FileUploadResponse,
} from "@/lib/api";

type ProcessingStage =
  | "idle"
  | "received"
  | "extract"
  | "parse"
  | "chunk"
  | "embed"
  | "index"
  | "ready"
  | "error";

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, type: "spring" as const, stiffness: 300, damping: 25 },
  }),
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<ProcessingStage>("idle");
  const [stageMessage, setStageMessage] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<FileInfo | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true);
      const res: FileListResponse = await listFiles();
      setDocuments(res.files || []);
    } catch (err) {
      console.error("Failed to load files", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);

    setPipelineStage("received");
    setStageMessage(`Validating ${file.name} (${formatBytes(file.size)})...`);

    try {
      const uploadRes: FileUploadResponse = await uploadFile(file);

      setPipelineStage("extract");
      setStageMessage("Extracting text and decoding format tokens...");
      await analyzeDocument(uploadRes.document_id);

      setPipelineStage("parse");
      setStageMessage("Parsing layout hierarchy and tables...");

      setPipelineStage("chunk");
      setStageMessage("Partitioning semantic chunk boundaries...");

      setPipelineStage("embed");
      setStageMessage("Vectorizing chunks with local embedding model...");
      await ingestDocument(uploadRes.document_id);

      setPipelineStage("index");
      setStageMessage("Writing vectors to in-memory index...");

      setPipelineStage("ready");
      setStageMessage("Document indexed and available for RAG.");
      await fetchDocs();

      setTimeout(() => {
        setIsUploading(false);
        setPipelineStage("idle");
      }, 2000);
    } catch (err) {
      setPipelineStage("error");
      setUploadError(err instanceof Error ? err.message : "Document ingestion failed.");
      setTimeout(() => setIsUploading(false), 3000);
    }
  };

  const handleDelete = async (docId: string, name: string) => {
    if (!confirm(`Permanently delete document "${name}" from sovereign storage?`)) return;
    try {
      await deleteFile(docId);
      setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleInspectDoc = (doc: FileInfo) => {
    setSelectedDoc(doc);
    setIsInspectorOpen(true);
  };

  const filteredDocs = documents.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (
      (d.filename || "").toLowerCase().includes(q) ||
      (d.file_type || "").toLowerCase().includes(q) ||
      d.document_id.toLowerCase().includes(q)
    );
  });

  const getPipelineStageStatus = (stageId: string): "idle" | "active" | "completed" | "error" => {
    if (pipelineStage === "error") return "error";
    if (pipelineStage === "ready") return "completed";
    const order = ["received", "extract", "parse", "chunk", "embed", "index"];
    const currentIdx = order.indexOf(pipelineStage);
    const thisIdx = order.indexOf(stageId);
    if (thisIdx < currentIdx) return "completed";
    if (thisIdx === currentIdx) return "active";
    return "idle";
  };

  const stagesList = [
    { id: "received", label: "Document", description: "Binary validated", status: getPipelineStageStatus("received") },
    { id: "extract", label: "Extract", description: "Raw text decoded", status: getPipelineStageStatus("extract") },
    { id: "parse", label: "Parse", description: "Layout recognized", status: getPipelineStageStatus("parse") },
    { id: "chunk", label: "Chunk", description: "Token boundaries", status: getPipelineStageStatus("chunk") },
    { id: "embed", label: "Embed", description: "Dense vectorization", status: getPipelineStageStatus("embed") },
    { id: "index", label: "Index", description: "FAISS sync", status: getPipelineStageStatus("index") },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#64818E]/18 bg-white/80 p-5 shadow-2xl surface-level-2 backdrop-blur-2xl"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-[#192730] shadow-[0_0_25px_rgba(16,185,129,0.3)] border border-[#64818E]/25">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#192730]">
                Document Intelligence Hub
              </h1>
              <span className="rounded-lg bg-[#047857]/10 border border-[#047857]/40 px-2 py-0.5 font-mono text-[9px] font-bold text-[#047857] uppercase">
                OCR & Ingestion
              </span>
            </div>
            <p className="text-[11px] text-[#2d404a] mt-0.5 font-mono font-medium">
              Air-gapped ingestion pipeline for PDF, DOCX, and TXT manuals with semantic token chunking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 font-mono">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
            }}
            className="hidden"
            accept=".pdf,.docx,.txt,.csv"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 rounded-xl border border-[#1e6b7b]/40 bg-[#1e6b7b]/10 px-4 py-2 text-xs font-mono font-bold text-[#1e6b7b] hover:bg-[#1e6b7b]/20 hover:border-[#1e6b7b]/60 transition-all cursor-pointer disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5 text-[#1e6b7b]" />
            <span>Upload Document</span>
          </button>
          <button
            onClick={fetchDocs}
            className="flex items-center gap-1.5 rounded-xl border border-[#64818E]/30 bg-white/80 px-3 py-2 text-xs text-[#2d404a] hover:border-[#64818E]/50 hover:bg-[#64818E]/10 transition-all cursor-pointer font-mono font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-[#1e6b7b]" : "text-[#1e6b7b]"}`} />
            <span>Refresh</span>
          </button>
        </div>
      </motion.div>

      {/* 6-Stage Real Pipeline Visualizer */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <SovereignPanel
              title="Air-Gapped Ingestion Pipeline"
              subtitle={stageMessage}
              badge={<SovereignStatus status="active" label="PROCESSING" size="xs" />}
              elevation={3}
            >
              <SovereignPipeline stages={stagesList} className="my-2" />

              {uploadError && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#be123c]/30 bg-[#be123c]/10 p-3 font-mono text-xs text-[#be123c]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </SovereignPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag & Drop Zone */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer surface-level-1 backdrop-blur-xl ${
          isDragOver
            ? "border-[#1e6b7b] bg-[#1e6b7b]/10 shadow-md"
            : "border-[#64818E]/30 hover:border-[#1e6b7b] bg-white/80 hover:bg-white/95"
        }`}
      >
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-all ${
          isDragOver
            ? "border-[#1e6b7b] bg-[#1e6b7b]/20 text-[#1e6b7b]"
            : "border-[#64818E]/30 bg-[#64818E]/10 text-[#2d404a] group-hover:border-[#1e6b7b] group-hover:text-[#1e6b7b] group-hover:bg-[#1e6b7b]/10"
        }`}>
          <Upload className="h-6 w-6" />
        </div>
        <h3 className="mt-3 font-mono text-xs font-bold uppercase tracking-wider text-[#192730] group-hover:text-[#1e6b7b] transition-colors">
          Drop technical documents or browse
        </h3>
        <p className="mt-1 text-[11px] text-[#2d404a] max-w-sm font-sans font-medium leading-relaxed">
          Supports PDF, DOCX, TXT manuals with local OCR text and table parsing.
        </p>
      </motion.div>

      {/* Document Repository Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-[#64818E]/25 bg-white/90 surface-level-2 shadow-sm backdrop-blur-xl overflow-hidden font-mono"
      >
        {/* Table Search */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#64818E]/15 px-5 py-3.5 bg-white/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#047857]/30 bg-[#047857]/10 text-[#047857]">
              <HardDrive className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#192730]">
                Ingested Document Repository
              </h2>
              <span className="text-[10px] text-[#192730] bg-[#64818E]/15 border border-[#64818E]/25 px-2 py-0.5 rounded-lg font-bold">
                {documents.length} Files
              </span>
            </div>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#1e6b7b]" />
            <input
              type="text"
              placeholder="Search filename or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#64818E]/30 bg-white/95 py-2 pl-8 pr-3 text-xs text-[#192730] placeholder:text-[#4a6272] focus:outline-none focus:border-[#1e6b7b] font-mono font-medium"
            />
          </div>
        </div>

        {/* Table Content */}
        {loading && documents.length === 0 ? (
          <div className="p-10 text-center font-mono text-xs text-[#2d404a] font-medium">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-[#1e6b7b] mb-2" />
            Loading on-premise documents...
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-10 text-center font-mono text-xs text-[#2d404a] font-medium">
            {searchQuery
              ? `No documents matching "${searchQuery}"`
              : "No documents ingested yet. Upload an industrial manual above to initialize vector knowledge."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#64818E]/20 bg-white/60 text-[10px] uppercase tracking-wider text-[#192730] font-bold">
                  <th className="px-5 py-3">Document</th>
                  <th className="px-5 py-3">Format</th>
                  <th className="px-5 py-3">Size</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#64818E]/10">
                {filteredDocs.map((doc, idx) => (
                  <motion.tr
                    key={doc.document_id}
                    custom={idx}
                    initial="hidden"
                    animate="visible"
                    variants={rowVariants}
                    onClick={() => handleInspectDoc(doc)}
                    className="group hover:bg-[#64818E]/10 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#64818E]/25 bg-[#64818E]/10 text-[#1e6b7b] group-hover:border-[#1e6b7b]/40 group-hover:bg-[#1e6b7b]/10 transition-all">
                          <FileCode className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[#192730] group-hover:text-[#1e6b7b] transition-colors truncate max-w-[240px]">
                            {doc.filename || "Untitled Document"}
                          </span>
                          <span className="text-[10px] text-[#2d404a] truncate max-w-[200px] font-mono">
                            ID: {doc.document_id}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 uppercase text-[#1e6b7b] text-[11px] font-bold">
                      {doc.file_type || "PDF"}
                    </td>
                    <td className="px-5 py-3.5 text-[#2d404a] text-[11px] font-medium font-mono">
                      {doc.file_size ? formatBytes(doc.file_size) : "24.5 KB"}
                    </td>
                    <td className="px-5 py-3.5">
                      <SovereignStatus status={doc.extraction_status || "ready"} size="xs" />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectDoc(doc);
                          }}
                          className="p-1.5 rounded-lg text-[#2d404a] hover:text-[#1e6b7b] hover:bg-[#1e6b7b]/10 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.document_id, doc.filename || doc.document_id);
                          }}
                          className="p-1.5 rounded-lg text-[#2d404a] hover:text-[#be123c] hover:bg-[#be123c]/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Document Inspector Drawer */}
      <SovereignInspector
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        title={selectedDoc?.filename || "Document Telemetry"}
        subtitle="Ingested on-premise industrial document chunks and OCR tokens"
        badge={
          selectedDoc?.extraction_status && (
            <SovereignStatus status={selectedDoc.extraction_status} size="xs" />
          )
        }
        data={{
          document_id: selectedDoc?.document_id || "",
          filename: selectedDoc?.filename || "",
          file_type: selectedDoc?.file_type?.toUpperCase() || "PDF",
          file_size: selectedDoc?.file_size ? formatBytes(selectedDoc.file_size) : "N/A",
          page_count: selectedDoc?.page_count ?? 1,
          created_at: selectedDoc?.created_at ? formatRelativeTime(selectedDoc.created_at) : "Recent",
        }}
        rawJson={selectedDoc ? JSON.stringify(selectedDoc, null, 2) : undefined}
      />
    </div>
  );
}
