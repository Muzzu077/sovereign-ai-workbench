"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type SovereignStatusType =
  | "operational"
  | "healthy"
  | "ready"
  | "active"
  | "processing"
  | "streaming"
  | "executing"
  | "degraded"
  | "warning"
  | "critical"
  | "unavailable"
  | "error"
  | "air-gapped"
  | "isolated"
  | "standby"
  | "idle";

interface SovereignStatusProps {
  status: SovereignStatusType | string;
  label?: string;
  size?: "xs" | "sm" | "md";
  showDot?: boolean;
  className?: string;
}

export default function SovereignStatus({
  status,
  label,
  size = "sm",
  showDot = true,
  className,
}: SovereignStatusProps) {
  const normStatus = (status || "").toLowerCase() as SovereignStatusType;

  const config: Record<
    string,
    { dotBg: string; text: string; border: string; bg: string; defaultLabel: string; pulse?: boolean }
  > = {
    operational: {
      dotBg: "bg-[#047857]",
      text: "text-[#047857]",
      border: "border-[#047857]/25",
      bg: "bg-[#047857]/8",
      defaultLabel: "OPERATIONAL",
    },
    healthy: {
      dotBg: "bg-[#047857]",
      text: "text-[#047857]",
      border: "border-[#047857]/25",
      bg: "bg-[#047857]/8",
      defaultLabel: "HEALTHY",
    },
    ready: {
      dotBg: "bg-[#047857]",
      text: "text-[#047857]",
      border: "border-[#047857]/25",
      bg: "bg-[#047857]/8",
      defaultLabel: "READY",
    },
    active: {
      dotBg: "bg-[#64818E]",
      text: "text-[#64818E]",
      border: "border-[#64818E]/25",
      bg: "bg-[#64818E]/10",
      defaultLabel: "ACTIVE",
      pulse: true,
    },
    processing: {
      dotBg: "bg-[#64818E]",
      text: "text-[#64818E]",
      border: "border-[#64818E]/25",
      bg: "bg-[#64818E]/10",
      defaultLabel: "PROCESSING",
      pulse: true,
    },
    streaming: {
      dotBg: "bg-[#1e6b7b]",
      text: "text-[#1e6b7b]",
      border: "border-[#1e6b7b]/25",
      bg: "bg-[#1e6b7b]/10",
      defaultLabel: "STREAMING",
      pulse: true,
    },
    executing: {
      dotBg: "bg-[#1e6b7b]",
      text: "text-[#1e6b7b]",
      border: "border-[#1e6b7b]/25",
      bg: "bg-[#1e6b7b]/10",
      defaultLabel: "EXECUTING",
      pulse: true,
    },
    "air-gapped": {
      dotBg: "bg-[#1e6b7b]",
      text: "text-[#1e6b7b]",
      border: "border-[#1e6b7b]/25",
      bg: "bg-[#1e6b7b]/8",
      defaultLabel: "AIR-GAPPED",
    },
    isolated: {
      dotBg: "bg-[#1e6b7b]",
      text: "text-[#1e6b7b]",
      border: "border-[#1e6b7b]/25",
      bg: "bg-[#1e6b7b]/8",
      defaultLabel: "ISOLATED",
    },
    degraded: {
      dotBg: "bg-[#b45309]",
      text: "text-[#b45309]",
      border: "border-[#b45309]/25",
      bg: "bg-[#b45309]/10",
      defaultLabel: "DEGRADED",
    },
    warning: {
      dotBg: "bg-[#b45309]",
      text: "text-[#b45309]",
      border: "border-[#b45309]/25",
      bg: "bg-[#b45309]/10",
      defaultLabel: "WARNING",
    },
    critical: {
      dotBg: "bg-[#be123c]",
      text: "text-[#be123c]",
      border: "border-[#be123c]/25",
      bg: "bg-[#be123c]/10",
      defaultLabel: "CRITICAL",
    },
    unavailable: {
      dotBg: "bg-[#be123c]",
      text: "text-[#be123c]",
      border: "border-[#be123c]/25",
      bg: "bg-[#be123c]/10",
      defaultLabel: "UNAVAILABLE",
    },
    error: {
      dotBg: "bg-[#be123c]",
      text: "text-[#be123c]",
      border: "border-[#be123c]/25",
      bg: "bg-[#be123c]/10",
      defaultLabel: "ERROR",
    },
    standby: {
      dotBg: "bg-[#64818E]/50",
      text: "text-[#64818E]/70",
      border: "border-[#64818E]/30",
      bg: "bg-[#64818E]/8",
      defaultLabel: "STANDBY",
    },
    idle: {
      dotBg: "bg-[#64818E]/50",
      text: "text-[#64818E]/70",
      border: "border-[#64818E]/30",
      bg: "bg-[#64818E]/8",
      defaultLabel: "IDLE",
    },
  };

  const current = config[normStatus] || config.standby;

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[9px] gap-1",
    sm: "px-2 py-0.5 text-[10px] gap-1.5",
    md: "px-2.5 py-1 text-xs gap-2",
  }[size];

  const dotSize = {
    xs: "h-1 w-1",
    sm: "h-1.5 w-1.5",
    md: "h-2 w-2",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-semibold tracking-wider rounded border uppercase shrink-0 transition-colors",
        current.bg,
        current.border,
        current.text,
        sizeClasses,
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            "rounded-full shrink-0",
            dotSize,
            current.dotBg,
            current.pulse && "animate-status-pulse"
          )}
        />
      )}
      <span>{label || current.defaultLabel}</span>
    </span>
  );
}
