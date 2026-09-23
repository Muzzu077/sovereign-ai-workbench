"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageSquareCode,
  LayoutDashboard,
  FileText,
  Database,
  Bot,
  Cpu,
  Activity,
  Upload,
  Sparkles,
  Command,
  ArrowRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  title: string;
  description: string;
  category: "Navigation" | "Workflows" | "System";
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  shortcut?: string;
}

export default function CommandPalette() {
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
      title: "Open AI Chat Studio",
      description: "Interactive conversation & grounded RAG investigation",
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
      title: "Open Dashboard",
      description: "Telemetry, node architecture & subsystem integrity",
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
      title: "Open Document Intelligence Hub",
      description: "Air-gapped upload, OCR parsing & vector ingestion",
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
      title: "Search Knowledge Base",
      description: "Vector similarity search and evidence chunk explorer",
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
      title: "Execute Agent Task",
      description: "Deterministic planner, tool execution loop & audit trails",
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
      title: "Open Model Registry",
      description: "Local open-weight LLMs, context limits & quantization",
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
      title: "Ingest New Document",
      description: "Process PDF, DOCX, or TXT into air-gapped vector store",
      category: "Workflows",
      icon: Upload,
      action: () => {
        router.push("/documents");
        setIsOpen(false);
      },
    },
    {
      id: "action-rag",
      title: "Run Evidence Retrieval",
      description: "Execute query across local embeddings index",
      category: "Workflows",
      icon: Sparkles,
      action: () => {
        router.push("/knowledge");
        setIsOpen(false);
      },
    },
    {
      id: "action-diag",
      title: "Inspect Telemetry & Audit",
      description: "Check loopback isolation, vector index & append-only log",
      category: "System",
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#64818E]/40 bg-white/95 shadow-2xl shadow-[#64818E]/15 surface-level-4 animate-in zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-[#64818E]/30 px-4 py-3.5 bg-white/80">
          <Search className="h-5 w-5 text-[#1e6b7b] shrink-0" />
          <input
            type="text"
            placeholder="Type a command or jump to screen... (e.g. Chat, Ingest, Agent)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[#192730] placeholder:text-[#4a6272] focus:outline-none font-medium"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-[#64818E]/30 bg-[#C9D0D8]/50 px-2 py-0.5 font-mono text-[10px] text-[#2d404a] font-bold">
            <span>ESC</span>
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#2d404a] font-medium font-sans">
              No matching commands or destinations found.
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
                      : "text-[#2d404a] hover:bg-[#64818E]/8 hover:text-[#192730] border border-transparent"
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
                        <span className="rounded bg-[#C9D0D8]/60 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-[#2d404a] font-bold">
                          {cmd.category}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#2d404a] truncate font-sans">
                        {cmd.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cmd.shortcut && (
                      <kbd className="hidden sm:inline-block rounded border border-[#64818E]/30 bg-[#C9D0D8]/50 px-1.5 py-0.5 font-mono text-[10px] text-[#2d404a] font-bold">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <ArrowRight className="h-3.5 w-3.5 text-[#1e6b7b] animate-in slide-in-from-left-1" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="flex items-center justify-between border-t border-[#64818E]/20 px-4 py-2.5 bg-white/80 text-[10px] font-mono text-[#2d404a]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#64818E]/30 bg-[#C9D0D8]/60 px-1 py-0.2 text-[#192730]">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#64818E]/30 bg-[#C9D0D8]/60 px-1 py-0.2 text-[#192730]">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#64818E] bg-[#C9D0D8] px-1 py-0.2">ESC</kbd> Close
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[#64818E]">
            <Command className="h-3 w-3" />
            <span>SOVEREIGN COMMAND</span>
          </div>
        </div>
      </div>
    </div>
  );
}
