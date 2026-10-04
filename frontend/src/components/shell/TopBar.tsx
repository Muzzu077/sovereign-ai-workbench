"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Shield, Circle, Search, Sparkles, Terminal, ShieldCheck, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSystemStatus } from "./ShellContext";

const TITLES: Record<string, string> = {
  "/workspace": "AI Workspace",
  "/documents": "Document Intelligence",
  "/knowledge": "Knowledge RAG Studio",
  "/code": "Code Sandbox IDE",
  "/health": "System Telemetry & Security",
  "/models": "Model Registry & Inference",
  "/logs": "Audit Security Logs",
};

interface TopBarProps {
  onOpenCommand?: () => void;
}

export default function TopBar({ onOpenCommand }: TopBarProps) {
  const pathname = usePathname();
  const title = TITLES[pathname] || "Sovereign AI Workbench";
  const { activeModel, modelStatus, modelProvider, backendUp } = useSystemStatus();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between",
        "h-[var(--topbar-height)] border-b border-white/[0.08]",
        "bg-slate-950/70 backdrop-blur-xl",
        "px-6 transition-all duration-200",
      )}
      role="banner"
    >
      {/* Left: page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-bold tracking-tight text-white flex items-center gap-2">
          {title}
        </h1>
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
          className={cn(
            "group hidden sm:flex items-center gap-2.5 rounded-xl border border-white/[0.08]",
            "bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400",
            "hover:border-cyan-500/40 hover:bg-slate-800/80 hover:text-white",
            "transition-all duration-200 cursor-pointer shadow-xs",
          )}
          title="Search or jump to (Cmd+K)"
        >
          <Search size={13} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
          <span className="text-[11px] font-medium">Quick jump / Search...</span>
          <kbd className="rounded-md bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 border border-white/10 group-hover:border-cyan-500/30 transition-colors">
            ⌘K
          </kbd>
        </button>

        {/* Local zero-cloud guarantee badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full",
            "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400",
            "px-3 py-1 text-[10px] font-bold tracking-wider uppercase select-none shadow-[0_0_12px_rgba(16,185,129,0.15)]",
          )}
        >
          <ShieldCheck size={13} strokeWidth={2.4} className="text-emerald-400" />
          <span>Air-Gapped</span>
        </div>

        {/* Active model pill */}
        {activeModel && (
          <div className="hidden md:flex items-center gap-2 rounded-xl bg-slate-900/80 border border-white/[0.08] px-3 py-1 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="font-bold text-slate-200">
                {activeModel === "general" ? "Gemma 3 4B" : activeModel}
              </span>
              <span className="text-[10px] text-slate-400">
                (local)
              </span>
            </div>
          </div>
        )}

        {/* Connection status indicator */}
        <div
          title={backendUp ? "Backend online & verified" : "Backend unreachable"}
          className="relative flex h-2.5 w-2.5 items-center justify-center"
        >
          {backendUp && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full",
              backendUp === null
                ? "bg-amber-400"
                : backendUp
                ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]"
                : "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.9)]",
            )}
          />
        </div>
      </div>
    </header>
  );
}
