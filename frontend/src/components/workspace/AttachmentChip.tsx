"use client";

import React from "react";
import { cn, formatBytes } from "@/lib/utils";
import { X, Check, Loader2 } from "lucide-react";

interface AttachmentChipProps {
  file: File;
  onRemove: () => void;
  uploading?: boolean;
  uploadedId?: string;
  status?: "pending" | "uploading" | "processing" | "ready" | "failed";
  pageCount?: number;
}

function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function FileTypeBadge({ extension }: { extension: string }) {
  const label = extension.toUpperCase() || "FILE";

  const colorMap: Record<string, string> = {
    pdf: "bg-red-50 text-red-700 border-red-200",
    docx: "bg-sky-50 text-sky-700 border-sky-200",
    doc: "bg-sky-50 text-sky-700 border-sky-200",
    txt: "bg-stone-100 text-stone-600 border-stone-200",
  };

  const colorClass = colorMap[extension] ?? "bg-stone-100 text-stone-500 border-stone-200";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        "w-8 h-6 rounded border",
        "text-[9px] font-bold font-mono uppercase tracking-wider leading-none",
        colorClass,
      )}
    >
      {label}
    </span>
  );
}

export default function AttachmentChip({
  file,
  onRemove,
  uploading = false,
  uploadedId,
  status,
  pageCount,
}: AttachmentChipProps) {
  const extension = getFileExtension(file.name);
  const effectiveStatus = status ?? (uploading ? "uploading" : uploadedId ? "ready" : "pending");

  const statusLabel: Record<string, string> = {
    pending: "Pending",
    uploading: "Uploading...",
    processing: "Processing...",
    ready: "Ready",
    failed: "Failed",
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg",
        "border wb-card-interactive",
        "bg-[var(--color-wb-surface)]",
        effectiveStatus === "failed" && "border-[var(--color-wb-error-border)]",
      )}
    >
      <FileTypeBadge extension={extension} />

      <div className="flex flex-col min-w-0">
        <span
          className="text-[12px] font-medium text-[var(--color-wb-text)] truncate max-w-[160px]"
          title={file.name}
        >
          {file.name}
        </span>
        <span className="text-[10px] text-[var(--color-wb-text-muted)] leading-tight">
          {pageCount ? `${pageCount} pages` : formatBytes(file.size)}
          {effectiveStatus !== "ready" && effectiveStatus !== "pending" && (
            <> · {statusLabel[effectiveStatus]}</>
          )}
          {effectiveStatus === "ready" && (
            <> · Ready</>
          )}
        </span>
      </div>

      {/* Status indicator */}
      <div className="ml-auto flex items-center gap-1.5">
        {effectiveStatus === "uploading" && (
          <Loader2 className="h-3.5 w-3.5 text-[var(--color-wb-accent)] animate-spin-smooth" />
        )}
        {effectiveStatus === "processing" && (
          <Loader2 className="h-3.5 w-3.5 text-[var(--color-wb-warning)] animate-spin-smooth" />
        )}
        {effectiveStatus === "ready" && (
          <Check className="h-3.5 w-3.5 text-[var(--color-wb-success)]" />
        )}

        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "shrink-0 p-1 rounded-md wb-interactive",
            "text-[var(--color-wb-text-faint)]",
            "opacity-0 group-hover:opacity-100",
            "hover:text-[var(--color-wb-error)] hover:bg-[var(--color-wb-error-bg)]",
          )}
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
