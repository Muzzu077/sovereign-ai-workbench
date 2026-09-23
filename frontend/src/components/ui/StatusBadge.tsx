"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type StatusType =
  | "healthy"
  | "operational"
  | "active"
  | "ready"
  | "completed"
  | "success"
  | "warning"
  | "degraded"
  | "attention"
  | "error"
  | "critical"
  | "failed"
  | "unavailable"
  | "processing"
  | "running"
  | "waiting"
  | "pending"
  | "standby"
  | "info"
  | "air-gapped"
  | "offline";

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showDot?: boolean;
  pulse?: boolean;
}

export default function StatusBadge({
  status,
  label,
  size = "sm",
  className,
  showDot = true,
  pulse = false,
}: StatusBadgeProps) {
  const normStatus = (status || "unknown").toLowerCase().trim();

  let config = {
    bg: "bg-[#64818E]/10",
    border: "border-[#64818E]/20",
    text: "text-[#64818E]",
    dot: "bg-[#64818E]",
    dotGlow: "shadow-[0_0_8px_rgba(100,129,142,0.5)]",
    defaultLabel: normStatus.toUpperCase(),
  };

  if (
    ["healthy", "operational", "active", "ready", "completed", "success", "air-gapped"].includes(
      normStatus
    )
  ) {
    config = {
      bg: "bg-[#047857]/10",
      border: "border-[#047857]/30",
      text: "text-[#047857]",
      dot: "bg-[#047857]",
      dotGlow: "shadow-[0_0_8px_rgba(4,120,87,0.5)]",
      defaultLabel: normStatus === "air-gapped" ? "AIR-GAPPED" : "HEALTHY",
    };
  } else if (["warning", "degraded", "attention"].includes(normStatus)) {
    config = {
      bg: "bg-[#b45309]/10",
      border: "border-[#b45309]/30",
      text: "text-[#b45309]",
      dot: "bg-[#b45309]",
      dotGlow: "shadow-[0_0_8px_rgba(180,83,9,0.5)]",
      defaultLabel: "DEGRADED",
    };
  } else if (["error", "critical", "failed", "unavailable"].includes(normStatus)) {
    config = {
      bg: "bg-[#be123c]/10",
      border: "border-[#be123c]/30",
      text: "text-[#be123c]",
      dot: "bg-[#be123c]",
      dotGlow: "shadow-[0_0_8px_rgba(190,18,60,0.5)]",
      defaultLabel: "CRITICAL",
    };
  } else if (["processing", "running"].includes(normStatus)) {
    config = {
      bg: "bg-[#64818E]/12",
      border: "border-[#64818E]/30",
      text: "text-[#64818E]",
      dot: "bg-[#64818E]",
      dotGlow: "shadow-[0_0_8px_rgba(100,129,142,0.6)]",
      defaultLabel: "RUNNING",
    };
    pulse = true;
  } else if (["waiting", "pending", "standby", "offline"].includes(normStatus)) {
    config = {
      bg: "bg-[#C9D0D8]/30",
      border: "border-[#64818E]/25",
      text: "text-[#64818E]/80",
      dot: "bg-[#64818E]/80",
      dotGlow: "shadow-[0_0_4px_rgba(100,129,142,0.3)]",
      defaultLabel: normStatus.toUpperCase(),
    };
  } else if (["info", "data", "tfidf", "neural"].includes(normStatus)) {
    config = {
      bg: "bg-[#1e6b7b]/10",
      border: "border-[#1e6b7b]/30",
      text: "text-[#1e6b7b]",
      dot: "bg-[#1e6b7b]",
      dotGlow: "shadow-[0_0_8px_rgba(30,107,123,0.5)]",
      defaultLabel: normStatus.toUpperCase(),
    };
  }

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[9px] gap-1",
    sm: "px-2 py-0.5 text-[10px] gap-1.5",
    md: "px-2.5 py-1 text-xs gap-2",
    lg: "px-3 py-1.5 text-xs gap-2.5",
  }[size];

  const dotSizeClasses = {
    xs: "h-1 w-1",
    sm: "h-1.5 w-1.5",
    md: "h-2 w-2",
    lg: "h-2.5 w-2.5",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-mono font-medium tracking-wider uppercase border select-none transition-all duration-150 backdrop-blur-md",
        config.bg,
        config.border,
        config.text,
        sizeClasses,
        className
      )}
    >
      {showDot && (
        <span className="relative flex items-center justify-center">
          {pulse && (
            <span
              className={cn(
                "absolute rounded-full opacity-75 animate-ping",
                dotSizeClasses,
                config.dot
              )}
            />
          )}
          <span
            className={cn(
              "relative rounded-full",
              dotSizeClasses,
              config.dot,
              config.dotGlow
            )}
          />
        </span>
      )}
      <span>{label || config.defaultLabel}</span>
    </span>
  );
}
