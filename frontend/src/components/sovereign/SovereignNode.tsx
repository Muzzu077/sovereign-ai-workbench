"use client";

import React from "react";
import { cn } from "@/lib/utils";
import SovereignStatus from "./SovereignStatus";
import { LucideIcon } from "lucide-react";

export interface SovereignNodeProps {
  id: string;
  name: string;
  role: string;
  icon: LucideIcon;
  status: "operational" | "active" | "degraded" | "error" | "standby";
  metricLabel?: string;
  metricValue?: string | number;
  tags?: string[];
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
}

export default function SovereignNode({
  id,
  name,
  role,
  icon: Icon,
  status,
  metricLabel,
  metricValue,
  tags,
  isSelected,
  onSelect,
  className,
}: SovereignNodeProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "relative flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 backdrop-blur-xl group cursor-pointer",
        isSelected
          ? "border-[#64818E]/60 bg-[#64818E]/10 shadow-lg shadow-[#64818E]/15 surface-level-3"
          : "border-[#64818E]/15 bg-white/80 hover:border-[#64818E]/30 surface-level-2",
        className
      )}
    >
      {/* Port Connector Point Top & Bottom */}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full border border-[#64818E]/25 bg-white group-hover:border-[#64818E] transition-colors" />
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full border border-[#64818E]/25 bg-white group-hover:border-[#64818E] transition-colors" />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
              status === "operational"
                ? "border-[#047857]/30 bg-[#047857]/10 text-[#047857]"
                : status === "active"
                ? "border-[#64818E]/30 bg-[#64818E]/10 text-[#64818E]"
                : "border-[#64818E]/18 bg-[#64818E]/6 text-[#64818E]/70"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-mono text-xs font-bold text-[#192730] uppercase tracking-tight truncate">
              {name}
            </span>
            <span className="text-[10px] text-[#64818E]/70 font-sans truncate">{role}</span>
          </div>
        </div>
        <SovereignStatus status={status} size="xs" />
      </div>

      {/* Metric & Tags */}
      <div className="mt-3 pt-2.5 border-t border-[#64818E]/12 flex items-center justify-between font-mono text-[11px]">
        {metricLabel && metricValue !== undefined ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[#64818E]/70 uppercase text-[10px]">{metricLabel}:</span>
            <span className="font-bold text-[#2d404a]">{metricValue}</span>
          </div>
        ) : (
          <span className="text-[10px] text-[#64818E]/70 uppercase">LOCAL PROCESS</span>
        )}

        {tags && tags.length > 0 && (
          <span className="rounded bg-[#64818E]/6 border border-[#64818E]/18 px-1.5 py-0.2 text-[9px] text-[#64818E]/70">
            {tags[0]}
          </span>
        )}
      </div>
    </div>
  );
}
