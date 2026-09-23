"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageSquareCode,
  LayoutDashboard,
  FileText,
  Database,
  Bot,
  Cpu,
  Upload,
  Sparkles,
  Command,
  ArrowRight,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  title: string;
  description: string;
  category: "Navigation" | "Operations" | "Diagnostics";
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  shortcut?: string;
}

export default function SovereignCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Handle global shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const commands: CommandItem[] = [
    {
      id: "nav-chat",
      title: "Interactive AI Studio",
      description: "Air-gapped conversation, multi-persona reasoning & citations",
      category: "Navigation",
      icon: MessageSquareCode,
      action: () => {
        router.push("/chat");
        setIsOpen(false);
      },
      shortcut: "G C",
    },
    {
      id: "nav-dash",
      title: "Sovereign Core Dashboard",
      description: "Architecture topology, telemetry & node matrix",
      category: "Navigation",
      icon: LayoutDashboard,
      action: () => {
        router.push("/");
        setIsOpen(false);
      },
      shortcut: "G D",
    },
    {
      id: "nav-docs",
      title: "Document Intelligence Hub",
      description: "Local OCR ingestion, chunking pipeline & vector store",
      category: "Navigation",
      icon: FileText,
      action: () => {
        router.push("/documents");
        setIsOpen(false);
      },
      shortcut: "G U",
    },
    {
      id: "nav-knowledge",
      title: "Knowledge Base & RAG Engine",
      description: "Semantic query console, chunk inspector & embeddings",
      category: "Navigation",
      icon: Database,
      action: () => {
        router.push("/knowledge");
        setIsOpen(false);
      },
      shortcut: "G K",
    },
    {
      id: "nav-agent",
      title: "Autonomous Agent Orchestrator",
      description: "Deterministic planner, tool loop & execution timeline",
      category: "Navigation",
      icon: Bot,
      action: () => {
        router.push("/agent");
        setIsOpen(false);
      },
      shortcut: "G A",
    },
    {
      id: "nav-models",
      title: "Open-Weight Model Registry",
      description: "Local model runtimes, context lengths & quantization",
      category: "Navigation",
      icon: Cpu,
      action: () => {
        router.push("/models");
        setIsOpen(false);
      },
      shortcut: "G M",
    },
    {
      id: "action-upload",
      title: "Ingest Local File",
      description: "Direct upload to air-gapped document pipeline",
      category: "Operations",
      icon: Upload,
      action: () => {
        router.push("/documents");
        setIsOpen(false);
      },
    },
    {
      id: "action-rag",
      title: "Execute Vector Retrieval",
      description: "Query FAISS embeddings index for relevant chunks",
      category: "Operations",
      icon: Sparkles,
      action: () => {
        router.push("/knowledge");
        setIsOpen(false);
      },
    },
    {
      id: "action-diag",
      title: "Run Air-Gap Audit",
      description: "Verify localhost binding, HMAC signatures & logs",
      category: "Diagnostics",
      icon: ShieldCheck,
      action: () => {
        router.push("/");
        setIsOpen(false);
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev <= 0 ? filteredCommands.length - 1 : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-[#192730]/40 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#64818E]/20 bg-white/95 shadow-2xl surface-level-4 animate-in zoom-in-95 duration-150 text-[#192730]"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-[#64818E]/20 px-4 py-3.5 bg-white/80">
          <Search className="h-4 w-4 text-[#1e6b7b] shrink-0" />
          <input
            type="text"
            placeholder="Type a command or navigate... (e.g. Chat, Ingest, Agent, Models)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-[#192730] placeholder:text-[#4a6272] focus:outline-none font-mono font-medium"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-[#64818E]/30 bg-[#C9D0D8]/50 px-2 py-0.5 font-mono text-[10px] text-[#2d404a] font-bold">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#2d404a] font-mono font-medium">
              No matching commands or routes.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = cmd.icon;

              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs transition-all duration-100 cursor-pointer",
                    isSelected
                      ? "bg-[#64818E]/15 border border-[#64818E]/35 text-[#192730] shadow-sm"
                      : "text-[#2d404a] hover:bg-[#64818E]/10 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                        isSelected
                          ? "border-[#1e6b7b]/40 bg-[#1e6b7b]/15 text-[#1e6b7b]"
                          : "border-[#64818E]/20 bg-[#64818E]/8 text-[#2d404a]"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#192730] truncate">
                          {cmd.title}
                        </span>
                        <span className="rounded bg-[#C9D0D8]/60 border border-[#64818E]/20 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-[#2d404a] font-bold">
                          {cmd.category}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#2d404a] truncate font-sans">
                        {cmd.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono">
                    {cmd.shortcut && (
                      <kbd className="hidden sm:inline-block rounded border border-[#64818E]/30 bg-[#C9D0D8]/50 px-1.5 py-0.5 text-[10px] text-[#2d404a] font-bold">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <ArrowRight className="h-3.5 w-3.5 text-[#1e6b7b]" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#64818E]/15 px-4 py-2.5 bg-white/80 text-[10px] font-mono text-[#2d404a]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div className="flex items-center gap-1 text-[#1e6b7b] font-bold">
            <Command className="h-3 w-3" />
            <span>SOVEREIGN COMMAND</span>
          </div>
        </div>
      </div>
    </div>
  );
}
