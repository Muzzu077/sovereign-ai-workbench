"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Shield, Circle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSystemStatus } from "./ShellContext";

const TITLES: Record<string, string> = {
  "/workspace": "Workspace",
  "/documents": "Documents",
  "/knowledge": "Knowledge Base",
  "/health": "System Health",
  "/models": "Models",
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
        "h-[var(--topbar-height)] border-b",
        "bg-[var(--color-wb-surface)]/95 backdrop-blur-sm",
        "px-6",
      )}
      role="banner"
    >
      {/* Left: page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-wb-text)]">
          {title}
        </h1>
      </div>

      {/* Right: command palette trigger + system info */}
      <div className="flex items-center gap-3.5">
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
          className="hidden sm:flex items-center gap-2 rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-bg)] px-2.5 py-1 text-xs text-[var(--color-wb-text-muted)] hover:border-[var(--color-wb-border-strong)] hover:text-[var(--color-wb-text)] transition-colors cursor-pointer shadow-2xs"
          title="Search or jump to (Cmd+K)"
        >
          <Search size={12} />
          <span className="text-[11px]">Quick search...</span>
          <kbd className="rounded bg-[var(--color-wb-surface)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--color-wb-text-muted)] border border-[var(--color-wb-border-subtle)]">
            ⌘K
          </kbd>
        </button>

        {/* Local inference badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full",
            "bg-[var(--color-wb-success-bg)] border border-[var(--color-wb-success-border)]",
            "px-2.5 py-0.5",
          )}
        >
          <Shield size={11} strokeWidth={2.2} className="text-[var(--color-wb-success)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-wb-success)]">
            Local
          </span>
        </div>

        {/* Active model */}
        {activeModel && (
          <div className="flex items-center gap-2 text-xs">
            <Circle
              size={6}
              fill="currentColor"
              className={cn(
                modelStatus === "available"
                  ? "text-[var(--color-wb-success)]"
                  : "text-[var(--color-wb-warning)]",
              )}
            />
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-[var(--color-wb-text)] leading-tight">
                {activeModel === "general" ? "Gemma 3 4B" : activeModel}
              </span>
              {modelProvider && (
                <span className="text-[10px] text-[var(--color-wb-text-muted)] leading-tight">
                  {modelProvider === "llama_cpp" ? "llama.cpp" : modelProvider}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Connection dot */}
        <div
          title={backendUp ? "Backend connected" : "Backend offline"}
          className={cn(
            "h-2 w-2 rounded-full",
            backendUp === null
              ? "bg-amber-400"
              : backendUp
              ? "bg-emerald-400"
              : "bg-red-400",
          )}
        />
      </div>
    </header>
  );
}
