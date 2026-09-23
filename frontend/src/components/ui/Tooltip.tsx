"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  shortcut?: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export default function Tooltip({
  content,
  shortcut,
  children,
  position = "top",
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const posClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[position];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#64818E]/80 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-[#2d404a] shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100",
            posClasses,
            className
          )}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd className="rounded border border-[#64818E] bg-[#C9D0D8] px-1 py-0.2 font-mono text-[9px] text-[#64818E]/70">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
}
