"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Search,
  MessageSquare,
  FileText,
  BookOpen,
  Activity,
  Cpu,
  ArrowRight,
  Upload,
  Plus,
  Zap,
  Code2,
  ScrollText,
} from "lucide-react";

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Actions";
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const items: CommandItem[] = [
    {
      id: "nav-workspace",
      title: "Go to AI Workspace",
      category: "Navigation",
      icon: MessageSquare,
      action: () => {
        router.push("/workspace");
        onClose();
      },
    },
    {
      id: "nav-documents",
      title: "Go to Document Intelligence",
      category: "Navigation",
      icon: FileText,
      action: () => {
        router.push("/documents");
        onClose();
      },
    },
    {
      id: "nav-knowledge",
      title: "Go to Knowledge RAG Studio",
      category: "Navigation",
      icon: BookOpen,
      action: () => {
        router.push("/knowledge");
        onClose();
      },
    },
    {
      id: "nav-code",
      title: "Go to Code Sandbox IDE",
      category: "Navigation",
      icon: Code2,
      action: () => {
        router.push("/code");
        onClose();
      },
    },
    {
      id: "nav-models",
      title: "Go to Model Registry",
      category: "Navigation",
      icon: Cpu,
      action: () => {
        router.push("/models");
        onClose();
      },
    },
    {
      id: "nav-health",
      title: "Go to System Health & Telemetry",
      category: "Navigation",
      icon: Activity,
      action: () => {
        router.push("/health");
        onClose();
      },
    },
    {
      id: "nav-logs",
      title: "Go to Audit Security Ledger",
      category: "Navigation",
      icon: ScrollText,
      action: () => {
        router.push("/logs");
        onClose();
      },
    },
    {
      id: "action-upload",
      title: "Upload & Ingest Document",
      category: "Actions",
      icon: Upload,
      action: () => {
        router.push("/documents");
        onClose();
      },
    },
    {
      id: "action-test-model",
      title: "Run Local Inference Test",
      category: "Actions",
      icon: Zap,
      action: () => {
        router.push("/models");
        onClose();
      },
    },
  ];

  const filtered = items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase()),
  );

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
      }
    },
    [filtered, selectedIndex, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-cyan-500/30 bg-slate-950/95 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Top ambient glow bar */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-90 shadow-[0_0_12px_rgba(6,182,212,0.8)]" />

        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5 bg-slate-900/60">
          <Search size={16} className="text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or jump to view..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none font-medium"
          />
          <kbd className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400 border border-white/10 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No matching commands or views found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "relative flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all duration-150 cursor-pointer select-none",
                    isSelected
                      ? "bg-gradient-to-r from-cyan-950/80 to-slate-900 text-white border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                      : "text-slate-300 hover:bg-slate-900/60 border border-transparent",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                        isSelected
                          ? "bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                          : "bg-slate-800/80 text-slate-400",
                      )}
                    >
                      <Icon size={15} />
                    </div>
                    <div>
                      <span className="text-xs font-semibold block text-white">{item.title}</span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {item.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <ArrowRight size={14} className="text-cyan-400 animate-pulse" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-white/[0.08] bg-slate-950 px-4 py-2.5 text-[10px] text-slate-400">
          <div className="flex items-center gap-2 font-mono">
            <span>Use <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-white/10 text-slate-300">↑</kbd> <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-white/10 text-slate-300">↓</kbd> to navigate</span>
            <span>·</span>
            <span><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-white/10 text-slate-300">↵</kbd> to execute</span>
          </div>
          <span className="font-mono text-cyan-400 font-bold tracking-wider">AIR-GAPPED CLI</span>
        </div>
      </div>
    </div>
  );
}
