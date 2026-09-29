"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { EvidenceQuality } from "@/lib/api/types";
import { ShieldCheck, ShieldAlert, ShieldX, Shield } from "lucide-react";

interface EvidenceBadgeProps {
  quality: EvidenceQuality;
  showDescription?: boolean;
  sourceCount?: number;
}

const qualityConfig: Record<
  EvidenceQuality,
  {
    label: string;
    description: string;
    icon: React.ElementType;
    accent: string;
    bg: string;
    border: string;
    dot: string;
  }
> = {
  strong_evidence: {
    label: "Strong Evidence",
    description: "High-confidence answer grounded in local sources",
    icon: ShieldCheck,
    accent: "text-[var(--color-wb-success)]",
    bg: "bg-[var(--color-wb-success-bg)]",
    border: "border-[var(--color-wb-success-border)]",
    dot: "bg-[var(--color-wb-success)]",
  },
  sufficient_evidence: {
    label: "Sufficient Evidence",
    description: "Answer supported by available sources",
    icon: Shield,
    accent: "text-[var(--color-wb-accent)]",
    bg: "bg-[var(--color-wb-accent-subtle)]",
    border: "border-[var(--color-wb-accent-muted)]",
    dot: "bg-[var(--color-wb-accent)]",
  },
  weak_evidence: {
    label: "Weak Evidence",
    description: "Limited source support — verify independently",
    icon: ShieldAlert,
    accent: "text-[var(--color-wb-warning)]",
    bg: "bg-[var(--color-wb-warning-bg)]",
    border: "border-[var(--color-wb-warning-border)]",
    dot: "bg-[var(--color-wb-warning)]",
  },
  no_evidence: {
    label: "No Evidence",
    description: "No reliable sources matched this query",
    icon: ShieldX,
    accent: "text-[var(--color-wb-error)]",
    bg: "bg-[var(--color-wb-error-bg)]",
    border: "border-[var(--color-wb-error-border)]",
    dot: "bg-[var(--color-wb-error)]",
  },
};

export default function EvidenceBadge({
  quality,
  showDescription = false,
  sourceCount,
}: EvidenceBadgeProps) {
  const config = qualityConfig[quality];
  if (!config) return null;

  const Icon = config.icon;

  if (showDescription) {
    return (
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
          config.bg,
          config.border,
        )}
      >
        <div className={cn("mt-0.5 shrink-0", config.accent)}>
          <Icon size={15} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={cn("text-xs font-semibold", config.accent)}>
            {config.label}
          </span>
          <span className="text-[11px] text-[var(--color-wb-text-secondary)] leading-snug">
            {config.description}
            {sourceCount != null && sourceCount > 0 && (
              <> · {sourceCount} local {sourceCount === 1 ? "source" : "sources"}</>
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border",
        "text-[11px] font-semibold leading-none select-none",
        config.bg,
        config.border,
        config.accent,
      )}
    >
      <span className={cn("h-[5px] w-[5px] rounded-full", config.dot)} />
      {config.label}
      {sourceCount != null && sourceCount > 0 && (
        <span className="font-normal opacity-70 ml-0.5">
          · {sourceCount}
        </span>
      )}
    </span>
  );
}
