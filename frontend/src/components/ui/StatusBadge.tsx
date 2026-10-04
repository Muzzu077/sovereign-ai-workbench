"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "success" | "warning" | "error" | "info" | "neutral" | "active";
  label: string;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({
  status,
  label,
  pulse = true,
  size = "md",
  className,
}: StatusBadgeProps) {
  const styles = {
    success: {
      bg: "bg-[var(--color-wb-success-bg)] border-[var(--color-wb-success-border)] text-[var(--color-wb-success)]",
      dot: "bg-emerald-500",
      ring: "ring-emerald-500/30",
    },
    warning: {
      bg: "bg-[var(--color-wb-warning-bg)] border-[var(--color-wb-warning-border)] text-[var(--color-wb-warning)]",
      dot: "bg-amber-500",
      ring: "ring-amber-500/30",
    },
    error: {
      bg: "bg-[var(--color-wb-error-bg)] border-[var(--color-wb-error-border)] text-[var(--color-wb-error)]",
      dot: "bg-red-500",
      ring: "ring-red-500/30",
    },
    info: {
      bg: "bg-[var(--color-wb-info-bg)] border-[var(--color-wb-info-border)] text-[var(--color-wb-info)]",
      dot: "bg-blue-500",
      ring: "ring-blue-500/30",
    },
    active: {
      bg: "bg-[var(--color-wb-accent-subtle)] border-[var(--color-wb-accent-muted)] text-[var(--color-wb-accent)]",
      dot: "bg-[var(--color-wb-accent)]",
      ring: "ring-teal-500/30",
    },
    neutral: {
      bg: "bg-[var(--color-wb-bg-inset)] border-[var(--color-wb-border)] text-[var(--color-wb-text-secondary)]",
      dot: "bg-stone-400",
      ring: "ring-stone-400/20",
    },
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium select-none shadow-2xs",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        styles.bg,
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5 items-center justify-center">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              styles.dot,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full ring-2",
            styles.dot,
            styles.ring,
          )}
        />
      </span>
      <span>{label}</span>
    </span>
  );
}

export default StatusBadge;
