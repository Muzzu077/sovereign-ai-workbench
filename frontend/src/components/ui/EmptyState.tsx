"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-[#64818E] bg-white/30 px-6 py-14 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl border border-[#64818E]/80 bg-[#C9D0D8]/80 text-[#64818E]/70 shadow-inner">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold tracking-wide text-[#2d404a]">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[#64818E]/70">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
