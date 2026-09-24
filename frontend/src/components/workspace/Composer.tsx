"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Paperclip,
  ArrowUp,
  Loader2,
  Upload,
  MessageSquare,
  FileSearch,
  Search,
  Bot,
} from "lucide-react";
import AttachmentChip from "./AttachmentChip";

interface ComposerProps {
  onSend: (message: string, files: File[], mode: string) => void;
  disabled?: boolean;
  allowedExtensions?: string[];
  /** When true, renders at hero size for the empty state */
  hero?: boolean;
}

const MODES = [
  { key: "ask", label: "Ask", icon: MessageSquare, description: "General questions" },
  { key: "analyze", label: "Analyze", icon: FileSearch, description: "Document analysis" },
  { key: "knowledge", label: "Knowledge", icon: Search, description: "RAG search" },
  { key: "agent", label: "Agent", icon: Bot, description: "Multi-step tasks" },
] as const;

type Mode = (typeof MODES)[number]["key"];

const DEFAULT_EXTENSIONS = [".pdf", ".docx", ".txt"];
const MAX_ROWS = 8;

export default function Composer({
  onSend,
  disabled = false,
  allowedExtensions,
  hero = false,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>("ask");
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extensions = allowedExtensions ?? DEFAULT_EXTENSIONS;
  const acceptStr = extensions.join(",");
  const canSend = !disabled && (text.trim().length > 0 || files.length > 0);

  // ── Auto-resize textarea ───────────────────────────────────────────
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = hero ? 26 : 22;
    const maxHeight = lineHeight * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [hero]);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim(), files, mode);
    setText("");
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [canSend, text, files, mode, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming).filter((f) => {
        const ext = `.${f.name.split(".").pop()?.toLowerCase()}`;
        return extensions.includes(ext);
      });
      if (arr.length > 0) setFiles((prev) => [...prev, ...arr]);
    },
    [extensions],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles],
  );

  // ── Drag-and-drop ──────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  // ── Placeholder text per mode ──────────────────────────────────────
  const placeholders: Record<Mode, string> = {
    ask: "Ask the workbench anything...",
    analyze: "Describe what to analyze, or drop a document...",
    knowledge: "Search your local knowledge base...",
    agent: "Describe a multi-step task to execute...",
  };

  return (
    <div
      className={cn(
        "relative flex flex-col",
        "rounded-xl",
        "border border-[var(--color-wb-border)]",
        "bg-[var(--color-wb-bg)]",
        "transition-all duration-[var(--duration-normal)]",
        // Focus ring
        focused && "border-[var(--color-wb-border-strong)] shadow-lg shadow-stone-900/5",
        !focused && "shadow-sm",
        // Drag state
        dragOver && "border-[var(--color-wb-accent)] ring-2 ring-[var(--color-wb-accent)]/15 bg-[var(--color-wb-accent-subtle)]",
        // Hero sizing
        hero && "shadow-md",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Drag overlay ──────────────────────────────────────────────── */}
      {dragOver && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-[var(--color-wb-accent-subtle)]/80 border-2 border-dashed border-[var(--color-wb-accent)] pointer-events-none backdrop-blur-[2px]">
          <Upload size={20} className="text-[var(--color-wb-accent)] mb-1.5" />
          <span className="text-sm font-medium text-[var(--color-wb-accent)]">
            Drop files here
          </span>
          <span className="text-[10px] text-[var(--color-wb-text-muted)] mt-0.5">
            PDF, DOCX, TXT
          </span>
        </div>
      )}

      {/* ── Mode tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-0">
        {MODES.map((m) => {
          const Icon = m.icon;
          const isActive = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              title={m.description}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                "text-[11px] font-medium",
                "transition-all duration-[var(--duration-fast)]",
                "cursor-pointer select-none",
                isActive
                  ? "bg-[var(--color-wb-accent-subtle)] text-[var(--color-wb-accent)] shadow-sm shadow-teal-900/5"
                  : "text-[var(--color-wb-text-faint)] hover:text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)]",
              )}
            >
              <Icon size={12} strokeWidth={isActive ? 2.2 : 1.8} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Attachment chips ──────────────────────────────────────────── */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2.5">
          {files.map((file, idx) => (
            <AttachmentChip
              key={`${file.name}-${file.size}-${idx}`}
              file={file}
              onRemove={() => removeFile(idx)}
            />
          ))}
        </div>
      )}

      {/* ── Input row ─────────────────────────────────────────────────── */}
      <div className={cn("flex items-end gap-2", hero ? "px-4 py-3" : "px-3 py-2.5")}>
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex items-center justify-center shrink-0",
            "h-8 w-8 rounded-lg wb-interactive",
            "text-[var(--color-wb-text-faint)]",
            "hover:text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)]",
          )}
          aria-label="Attach files"
        >
          <Paperclip size={15} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptStr}
          onChange={handleFileInputChange}
          className="hidden"
          tabIndex={-1}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholders[mode]}
          rows={1}
          disabled={disabled}
          className={cn(
            "flex-1 resize-none bg-transparent",
            "text-[var(--color-wb-text)]",
            "placeholder:text-[var(--color-wb-text-faint)]",
            "outline-none",
            "disabled:opacity-50",
            hero
              ? "text-[15px] leading-[26px] py-1.5"
              : "text-sm leading-[22px] py-1",
          )}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "flex items-center justify-center shrink-0",
            "rounded-lg wb-interactive",
            hero ? "h-9 w-9" : "h-8 w-8",
            canSend
              ? "bg-[var(--color-wb-accent)] text-white hover:bg-[var(--color-wb-accent-hover)] shadow-sm"
              : "bg-[var(--color-wb-surface-active)] text-[var(--color-wb-text-faint)] cursor-not-allowed",
          )}
          aria-label="Send message"
        >
          {disabled ? (
            <Loader2 size={16} className="animate-spin-smooth" />
          ) : (
            <ArrowUp size={16} strokeWidth={2.2} />
          )}
        </button>
      </div>

      {/* ── Keyboard hint ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="text-[10px] text-[var(--color-wb-text-faint)]">
          <kbd className="px-1 py-0.5 rounded border border-[var(--color-wb-border-subtle)] bg-[var(--color-wb-bg-inset)] text-[9px] font-mono">
            Enter
          </kbd>
          {" "}to send ·{" "}
          <kbd className="px-1 py-0.5 rounded border border-[var(--color-wb-border-subtle)] bg-[var(--color-wb-bg-inset)] text-[9px] font-mono">
            Shift+Enter
          </kbd>
          {" "}new line
        </span>
        {files.length > 0 && (
          <span className="text-[10px] text-[var(--color-wb-text-faint)] font-mono tabular-nums">
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        )}
      </div>
    </div>
  );
}
