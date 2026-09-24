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
      title: "Go to Workspace",
      category: "Navigation",
      icon: MessageSquare,
      action: () => {
        router.push("/workspace");
        onClose();
      },
    },
    {
      id: "nav-documents",
      title: "Go to Documents",
      category: "Navigation",
      icon: FileText,
      action: () => {
        router.push("/documents");
        onClose();
      },
    },
    {
      id: "nav-knowledge",
      title: "Go to Knowledge Base",
      category: "Navigation",
      icon: BookOpen,
      action: () => {
        router.push("/knowledge");
        onClose();
      },
    },
    {
      id: "nav-models",
      title: "Go to Models",
      category: "Navigation",
      icon: Cpu,
      action: () => {
        router.push("/models");
        onClose();
      },
    },
    {
      id: "nav-health",
      title: "Go to System Health",
      category: "Navigation",
      icon: Activity,
      action: () => {
        router.push("/health");
        onClose();
      },
    },
    {
      id: "action-upload",
      title: "Upload New Document",
      category: "Actions",
      icon: Upload,
      action: () => {
        router.push("/documents");
        onClose();
      },
    },
    {
      id: "action-test-model",
      title: "Test Local Inference",
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/40 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-[var(--color-wb-border)] px-4 py-3.5">
          <Search size={16} className="text-[var(--color-wb-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search workbench..."
            className="flex-1 bg-transparent text-sm text-[var(--color-wb-text)] placeholder:text-[var(--color-wb-text-muted)] outline-none"
          />
          <kbd className="rounded bg-[var(--color-wb-bg-inset)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-wb-text-muted)] border border-[var(--color-wb-border-subtle)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-wb-text-muted)]">
              No matching commands
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer",
                      isSelected
                        ? "bg-[var(--color-wb-surface-active)] text-[var(--color-wb-text)]"
                        : "text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)]",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg",
                          isSelected
                            ? "bg-[var(--color-wb-accent-subtle)] text-[var(--color-wb-accent)]"
                            : "bg-[var(--color-wb-bg-inset)] text-[var(--color-wb-text-muted)]",
                        )}
                      >
                        <Icon size={14} />
                      </div>
                      <span className="text-xs font-medium">{item.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--color-wb-text-muted)]">
                        {item.category}
                      </span>
                      {isSelected && (
                        <ArrowRight size={13} className="text-[var(--color-wb-accent)]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-[var(--color-wb-border-subtle)] bg-[var(--color-wb-bg-inset)] px-4 py-2 text-[10px] text-[var(--color-wb-text-muted)]">
          <div className="flex items-center gap-2">
            <span>Navigate with <kbd className="font-mono bg-[var(--color-wb-surface)] px-1 py-0.5 rounded border border-[var(--color-wb-border-subtle)]">↑</kbd> <kbd className="font-mono bg-[var(--color-wb-surface)] px-1 py-0.5 rounded border border-[var(--color-wb-border-subtle)]">↓</kbd></span>
            <span>·</span>
            <span>Select with <kbd className="font-mono bg-[var(--color-wb-surface)] px-1 py-0.5 rounded border border-[var(--color-wb-border-subtle)]">↵</kbd></span>
          </div>
          <span>Sovereign AI Workbench</span>
        </div>
      </div>
    </div>
  );
}
