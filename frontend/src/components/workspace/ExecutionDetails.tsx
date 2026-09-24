"use client";

import React, { useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import type { EvidenceQuality } from "@/lib/api/types";
import { ChevronRight, AlertTriangle, Cpu, Clock, Layers, Zap } from "lucide-react";

interface ExecutionDetailsProps {
  model: string;
  provider: string;
  evidenceQuality?: EvidenceQuality;
  retrievalTime?: number;
  generationTime?: number;
  totalTime?: number;
  tokensUsed?: number | null;
  fallbackUsed?: boolean;
}

interface DetailRow {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
}

export default function ExecutionDetails({
  model,
  provider,
  retrievalTime,
  generationTime,
  totalTime,
  tokensUsed,
  fallbackUsed = false,
}: ExecutionDetailsProps) {
  const [open, setOpen] = useState(false);

  const rows: DetailRow[] = [
    {
      label: "Model",
      value: model === "general" ? "Gemma 3 4B" : model,
      icon: Cpu,
    },
    {
      label: "Provider",
      value: provider === "llama_cpp" ? "llama.cpp (local)" : provider,
      icon: Layers,
    },
  ];

  if (totalTime != null) {
    rows.push({
      label: "Total time",
      value: formatDuration(totalTime),
      icon: Clock,
      accent: true,
    });
  }
  if (retrievalTime != null) {
    rows.push({ label: "Retrieval", value: formatDuration(retrievalTime), icon: Clock });
  }
  if (generationTime != null) {
    rows.push({ label: "Generation", value: formatDuration(generationTime), icon: Clock });
  }
  if (tokensUsed != null) {
    rows.push({ label: "Tokens", value: tokensUsed.toLocaleString(), icon: Zap });
  }

  return (
    <div className="rounded-lg border border-[var(--color-wb-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-left",
          "text-xs text-[var(--color-wb-text-secondary)] wb-interactive",
          "hover:bg-[var(--color-wb-surface-hover)]",
          "select-none",
        )}
        aria-expanded={open}
      >
        <ChevronRight
          size={13}
          className={cn(
            "shrink-0 text-[var(--color-wb-text-faint)] wb-interactive",
            open && "rotate-90",
          )}
        />
        <span className="text-[11px] font-semibold text-[var(--color-wb-text-secondary)]">
          Execution Details
        </span>

        {/* Quick summary when collapsed */}
        {!open && totalTime != null && (
          <span className="ml-auto text-[10px] font-mono text-[var(--color-wb-text-faint)] tabular-nums">
            {formatDuration(totalTime)}
          </span>
        )}

        {fallbackUsed && (
          <AlertTriangle size={12} className="text-[var(--color-wb-warning)] shrink-0 ml-1" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--color-wb-border)] px-3 py-3 bg-[var(--color-wb-bg-inset)] animate-slide-up">
          {fallbackUsed && (
            <div
              className={cn(
                "flex items-center gap-2 mb-3 px-2.5 py-2 rounded-md text-[11px]",
                "bg-[var(--color-wb-warning-bg)] border border-[var(--color-wb-warning-border)]",
                "text-[var(--color-wb-warning)]",
              )}
            >
              <AlertTriangle size={13} className="shrink-0" />
              <span>Fallback model was used — primary model unavailable</span>
            </div>
          )}

          <div className="space-y-2">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={12} className="text-[var(--color-wb-text-faint)]" />
                    <span className="text-[11px] text-[var(--color-wb-text-muted)]">
                      {row.label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-mono tabular-nums",
                      row.accent
                        ? "font-semibold text-[var(--color-wb-text)]"
                        : "text-[var(--color-wb-text-secondary)]"
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
