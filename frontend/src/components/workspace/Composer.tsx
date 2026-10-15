"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Paperclip,
  ArrowUp,
  CircleDot,
  FileText,
  BookOpenText,
  Workflow,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComposerProps {
  onSend: (text: string, files: File[], mode: string) => void;
  disabled?: boolean;
  hero?: boolean;
  defaultMode?: "direct" | "analyze" | "knowledge" | "agent";
  accept?: string;
}

const MODES = [
  { key: "direct", label: "Direct inference", icon: CircleDot },
  { key: "analyze", label: "Document analysis", icon: FileText },
  { key: "knowledge", label: "Knowledge RAG", icon: BookOpenText },
  { key: "agent", label: "Sandboxed agent", icon: Workflow },
] as const;

export default function Composer({
  onSend,
  disabled = false,
  hero = false,
  defaultMode = "direct",
  accept = ".pdf,.docx,.txt,.md",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<string>(defaultMode);
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extensions = accept.split(",").map((e) => e.trim().toLowerCase());

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const canSend = (text.trim().length > 0 || files.length > 0) && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim(), files, mode);
    setText("");
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [canSend, onSend, text, files, mode]);

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

  return (
    <div className="w-full">
      <div className="rounded-md border border-border bg-panel shadow-none focus-within:border-primary/50 transition-colors">
        {/* Top bar: Mode Selector */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-panel rounded-t-md">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {MODES.map((m) => {
              const isActive = mode === m.key;
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer",
                    isActive
                      ? "bg-accent text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  <Icon
                    size={13}
                    className={cn(
                      "shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <span className="hidden sm:inline font-mono text-[10px] text-faint">
            LOCAL ONLY
          </span>
        </div>

        {/* Attachment chips */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {files.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground"
              >
                <Paperclip size={10} className="text-primary" />
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="hover:text-destructive cursor-pointer"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Text input area */}
        <div className="px-3.5 py-3">
          <textarea
            ref={textareaRef}
            rows={hero ? 3 : 2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={
              mode === "direct"
                ? "Describe a task, ask a question, or analyze a document..."
                : mode === "analyze"
                ? "Attach documents to inspect uploaded files and findings..."
                : mode === "knowledge"
                ? "Query local knowledge base grounded in evidence..."
                : "Describe an autonomous task to plan, execute tools, and verify..."
            }
            className="w-full resize-none bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm leading-relaxed"
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={accept}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-muted-foreground bg-panel hover:bg-accent hover:text-foreground border border-border transition-colors cursor-pointer"
              title={`Attach files (${extensions.join(", ")})`}
            >
              <Paperclip size={13} className="text-primary" />
              <span className="text-[11px] font-medium">Attach local files</span>
            </button>
            <span className="hidden sm:inline font-mono text-[10px] text-faint">
              PDF, DOCX, TXT
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "size-8 rounded flex items-center justify-center transition-colors cursor-pointer",
                canSend
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
              title="Send prompt (Enter)"
            >
              {disabled ? (
                <Loader2 size={15} className="animate-spin text-primary-foreground" />
              ) : (
                <ArrowUp size={16} strokeWidth={2.4} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
