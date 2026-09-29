"use client";

import React, { useState } from "react";
import { cn, copyToClipboard } from "@/lib/utils";
import type { Citation } from "@/lib/api/types";
import { FileText, ChevronDown, Copy, Check } from "lucide-react";

interface SourceCitationProps {
  citation: Citation;
}

export default function SourceCitation({ citation }: SourceCitationProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const score = citation.relevance_score;

  const handleCopy = async () => {
    const text = [
      citation.document,
      citation.page != null ? `Page ${citation.page}` : null,
      citation.section,
    ]
      .filter(Boolean)
      .join(" · ");
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Score color based on relevance
  const scoreColor =
    score != null
      ? score >= 0.8
        ? "text-[var(--color-wb-success)]"
        : score >= 0.5
        ? "text-[var(--color-wb-accent)]"
        : "text-[var(--color-wb-text-muted)]"
      : "";

  return (
    <div
      className={cn(
        "group rounded-lg border wb-card-interactive overflow-hidden",
        "bg-[var(--color-wb-surface)]",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left"
      >
        {/* Doc icon with type indicator */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)]">
          <FileText size={14} className="text-[var(--color-wb-text-muted)]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] font-semibold text-[var(--color-wb-text)] truncate">
              {citation.document}
            </span>
            {score != null && (
              <span className={cn("text-[10px] font-mono font-semibold tabular-nums shrink-0", scoreColor)}>
                {(score * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {citation.page != null && (
              <span className="text-[10px] text-[var(--color-wb-text-secondary)]">
                Page {citation.page}
              </span>
            )}
            {citation.page != null && citation.section && (
              <span className="text-[var(--color-wb-text-faint)]">·</span>
            )}
            {citation.section && (
              <span className="text-[10px] text-[var(--color-wb-text-muted)] truncate">
                {citation.section}
              </span>
            )}
          </div>
        </div>

        {/* Relevance bar */}
        {score != null && (
          <div className="w-10 h-1.5 rounded-full bg-[var(--color-wb-surface-active)] overflow-hidden shrink-0">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                score >= 0.8
                  ? "bg-[var(--color-wb-success)]"
                  : score >= 0.5
                  ? "bg-[var(--color-wb-accent)]"
                  : "bg-[var(--color-wb-text-faint)]"
              )}
              style={{ width: `${Math.round(Math.min(score, 1) * 100)}%` }}
            />
          </div>
        )}

        {/* Expand chevron */}
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-[var(--color-wb-text-faint)] wb-interactive",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[var(--color-wb-border-subtle)] px-3 py-2.5 bg-[var(--color-wb-bg-inset)] animate-slide-up">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] text-[var(--color-wb-text-secondary)] space-y-1">
              <div>
                <span className="text-[var(--color-wb-text-faint)]">Document ID: </span>
                <span className="font-mono">{citation.document_id.slice(0, 12)}...</span>
              </div>
              {citation.chunk_id && (
                <div>
                  <span className="text-[var(--color-wb-text-faint)]">Chunk: </span>
                  <span className="font-mono">{citation.chunk_id.slice(0, 12)}...</span>
                </div>
              )}
              {score != null && (
                <div>
                  <span className="text-[var(--color-wb-text-faint)]">Relevance: </span>
                  <span className={cn("font-mono font-semibold", scoreColor)}>
                    {score.toFixed(4)}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className={cn(
                "p-1.5 rounded-md wb-interactive shrink-0",
                "text-[var(--color-wb-text-faint)]",
                "hover:text-[var(--color-wb-text)] hover:bg-[var(--color-wb-surface)]",
              )}
              aria-label="Copy citation"
            >
              {copied ? <Check size={12} className="text-[var(--color-wb-success)]" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
