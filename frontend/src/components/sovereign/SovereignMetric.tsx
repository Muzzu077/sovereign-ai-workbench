"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import SovereignStatus, { type SovereignStatusType } from "./SovereignStatus";

export interface SovereignMetricProps {
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  status?: SovereignStatusType;
  statusLabel?: string;
  icon?: React.ReactNode;
  accent?: "violet" | "cyan" | "emerald" | "amber" | "rose";
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
  };
  compact?: boolean;
  className?: string;
}

export default function SovereignMetric({
  label,
  value,
  unit,
  sublabel,
  status,
  statusLabel,
  icon,
  accent = "violet",
  trend,
  compact = false,
  className,
}: SovereignMetricProps) {
  const accentGlow = {
    violet: "hover:border-[#64818E]/40 hover:shadow-[0_0_15px_rgba(100,129,142,0.15)]",
    cyan: "hover:border-[#1e6b7b]/40 hover:shadow-[0_0_15px_rgba(30,107,123,0.15)]",
    emerald: "hover:border-[#047857]/40 hover:shadow-[0_0_15px_rgba(4,120,87,0.15)]",
    amber: "hover:border-[#b45309]/40 hover:shadow-[0_0_15px_rgba(180,83,9,0.15)]",
    rose: "hover:border-[#be123c]/40 hover:shadow-[0_0_15px_rgba(190,18,60,0.15)]",
  }[accent];

  const valueGradient = {
    violet: "text-[#192730] group-hover:text-[#64818E]",
    cyan: "text-[#192730] group-hover:text-[#1e6b7b]",
    emerald: "text-[#192730] group-hover:text-[#047857]",
    amber: "text-[#192730] group-hover:text-[#b45309]",
    rose: "text-[#192730] group-hover:text-[#be123c]",
  }[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "group flex flex-col justify-between rounded-xl border border-[#64818E]/15 bg-white/70 p-4 surface-level-1 backdrop-blur-xl transition-all duration-200 glass-hover-lift",
        accentGlow,
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#64818E]/8 border border-[#64818E]/15 text-[#64818E] group-hover:border-[#64818E]/35 group-hover:text-[#192730] transition-colors shrink-0">
              {icon}
            </span>
          )}
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#64818E]/70 group-hover:text-[#192730] transition-colors truncate">
            {label}
          </span>
        </div>
        {status && <SovereignStatus status={status} label={statusLabel} size="xs" />}
      </div>

      <div className={cn("flex items-baseline gap-1.5 font-mono", compact ? "my-1.5" : "my-2.5")}>
        <span className={cn("text-2xl font-extrabold tracking-tight transition-colors", valueGradient)}>
          {value}
        </span>
        {unit && <span className="text-xs font-semibold text-[#64818E]/70 uppercase">{unit}</span>}
      </div>

      {(sublabel || trend) && (
        <div className="flex items-center justify-between text-[10px] font-mono text-[#64818E]/70 pt-2 border-t border-[#64818E]/12">
          {sublabel && <span className="truncate">{sublabel}</span>}
          {trend && (
            <span
              className={cn(
                "ml-auto font-bold px-1.5 py-0.5 rounded",
                trend.direction === "up"
                  ? "bg-[#047857]/10 text-[#047857] border border-[#047857]/25"
                  : trend.direction === "down"
                  ? "bg-[#b45309]/10 text-[#b45309] border border-[#b45309]/25"
                  : "bg-[#64818E]/8 text-[#64818E]/70"
              )}
            >
              {trend.value}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
