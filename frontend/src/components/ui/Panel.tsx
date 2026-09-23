"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  level?: 1 | 2 | 3;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  noPadding?: boolean;
  borderAccent?: boolean;
}

export default function Panel({
  children,
  title,
  subtitle,
  icon,
  action,
  level = 2,
  className,
  headerClassName,
  bodyClassName,
  noPadding = false,
  borderAccent = false,
}: PanelProps) {
  const surfaceClass = {
    1: "surface-level-1",
    2: "surface-level-2",
    3: "surface-level-3",
  }[level];

  return (
    <div
      className={cn(
        "relative rounded-2xl transition-all duration-200 overflow-hidden",
        surfaceClass,
        borderAccent && "border-[#64818E]/40 shadow-[0_0_24px_rgba(99,102,241,0.12)]",
        className
      )}
    >
      {/* Top subtle inner hairline reflection */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Header if title/action provided */}
      {(title || action) && (
        <div
          className={cn(
            "flex items-center justify-between border-b border-[#64818E]/80 px-5 py-3.5 bg-white/40",
            headerClassName
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#64818E] bg-[#C9D0D8]/80 text-[#64818E]">
                {icon}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              {typeof title === "string" ? (
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#2d404a] truncate">
                  {title}
                </h3>
              ) : (
                title
              )}
              {subtitle && (
                <p className="text-[11px] text-[#64818E]/70 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
        </div>
      )}

      {/* Panel Body */}
      <div className={cn(!noPadding && "p-5", bodyClassName)}>{children}</div>
    </div>
  );
}
