"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ShieldCheck, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSystemStatus } from "./ShellContext";

const TITLES: Record<string, string> = {
  "/workspace": "AI Workspace",
  "/documents": "Document Intelligence",
  "/knowledge": "Knowledge Base & RAG",
  "/code": "Code Sandbox IDE",
  "/health": "System Telemetry & VRAM",
  "/models": "Model Registry & Inference",
  "/logs": "Audit Security Logs",
};

interface TopBarProps {
  onOpenCommand?: () => void;
}

export default function TopBar({ onOpenCommand }: TopBarProps) {
  const pathname = usePathname();
  const title = TITLES[pathname] || "Sovereign AI Workbench";
  const { activeModel, backendUp } = useSystemStatus();

  return (
    <header
      className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-border bg-background/95 px-8 backdrop-blur"
      role="banner"
    >
      {/* Left: page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold tracking-wide text-foreground">
          {title}
        </h1>
        <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
          / air-gapped
        </span>
      </div>

      {/* Right: command palette trigger + system info */}
      <div className="flex items-center gap-3">
        {/* Command palette search trigger */}
        <button
          type="button"
          onClick={() => {
            const event = new KeyboardEvent("keydown", {
              key: "k",
              metaKey: true,
              bubbles: true,
            });
            window.dispatchEvent(event);
          }}
          className="group hidden sm:flex items-center gap-2.5 rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          title="Search or jump to (Cmd+K)"
        >
          <Search size={13} className="text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="text-[11px] font-medium">Quick jump / Search...</span>
          <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
            ⌘K
          </kbd>
        </button>

        {/* Local zero-cloud guarantee badge */}
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold tracking-wider text-emerald-400 uppercase select-none">
          <ShieldCheck size={12} className="stroke-[2.5]" />
          <span>Air-Gapped Node</span>
        </div>

        {/* Model status indicator */}
        <div className="hidden lg:flex items-center gap-2 border border-border bg-panel rounded-md px-3 py-1.5 font-mono text-xs text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              backendUp ? "bg-primary animate-pulse" : "bg-destructive",
            )}
          />
          <span className="max-w-[140px] truncate text-foreground font-sans text-xs">
            {activeModel === "general" ? "Gemma 3 4B" : activeModel || "Local Model"}
          </span>
        </div>
      </div>
    </header>
  );
}
