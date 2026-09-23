"use client";

import React from "react";
import { cn } from "@/lib/utils";
import StatusBadge, { type StatusType } from "@/components/ui/StatusBadge";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  description?: string;
  status?: StatusType | string;
  statusLabel?: string;
  icon?: React.ReactNode;
  trend?: {
    direction: "up" | "down" | "neutral";
    label: string;
  };
  metrics?: Array<{ label: string; value: string | number }>;
  className?: string;
  onClick?: () => void;
  accent?: "indigo" | "cyan" | "emerald" | "amber" | "purple";
}

export default function MetricCard({
  title,
  value,
  unit,
  description,
  status,
  statusLabel,
  icon,
  trend,
  metrics,
  className,
  onClick,
  accent = "indigo",
}: MetricCardProps) {
  const accentClasses = {
    indigo: "border-[#64818E]/25 hover:border-[#64818E]/45 hover:shadow-[0_0_25px_rgba(100,129,142,0.15)]",
    cyan: "border-[#1e6b7b]/30 hover:border-[#1e6b7b]/50 hover:shadow-[0_0_25px_rgba(30,107,123,0.15)]",
    emerald: "border-[#047857]/30 hover:border-[#047857]/50 hover:shadow-[0_0_25px_rgba(4,120,87,0.15)]",
    amber: "border-[#b45309]/30 hover:border-[#b45309]/50 hover:shadow-[0_0_25px_rgba(180,83,9,0.15)]",
    purple: "border-[#A98688]/40 hover:border-[#A98688]/60 hover:shadow-[0_0_25px_rgba(169,134,136,0.15)]",
  }[accent];

  const iconClasses = {
    indigo: "border-[#64818E]/30 bg-[#64818E]/10 text-[#64818E]",
    cyan: "border-[#1e6b7b]/30 bg-[#1e6b7b]/10 text-[#1e6b7b]",
    emerald: "border-[#047857]/30 bg-[#047857]/10 text-[#047857]",
    amber: "border-[#b45309]/30 bg-[#b45309]/10 text-[#b45309]",
    purple: "border-[#A98688]/30 bg-[#A98688]/10 text-[#A98688]",
  }[accent];

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex flex-col justify-between rounded-2xl border bg-white/85 p-5 shadow-xl surface-level-2 transition-all duration-200 backdrop-blur-xl overflow-hidden group",
        accentClasses,
        onClick && "cursor-pointer active:scale-[0.99]",
        className
      )}
    >
      {/* Top subtle reflection line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105",
                iconClasses
              )}
            >
              {icon}
            </div>
          )}
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#2d404a] truncate">
            {title}
          </span>
        </div>
        {status && <StatusBadge status={status} label={statusLabel} size="xs" />}
      </div>

      {/* Main Metric Value */}
      <div className="my-4">
        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#192730]">
            {value}
          </span>
          {unit && (
            <span className="text-xs font-bold uppercase text-[#2d404a]">
              {unit}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-[11px] text-[#2d404a] line-clamp-1 font-sans">
            {description}
          </p>
        )}
      </div>

      {/* Sub-metrics or Trend */}
      {(metrics || trend) && (
        <div className="border-t border-[#64818E]/20 pt-3 mt-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
          {metrics &&
            metrics.map((m, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-[#2d404a]">
                <span className="text-[#4a6272]">{m.label}:</span>
                <span className="font-bold text-[#192730]">{m.value}</span>
              </div>
            ))}
          {trend && (
            <span
              className={cn(
                "text-[10px] font-bold",
                trend.direction === "up"
                  ? "text-[#047857]"
                  : trend.direction === "down"
                  ? "text-[#b45309]"
                   : "text-[#2d404a]"
              )}
            >
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
