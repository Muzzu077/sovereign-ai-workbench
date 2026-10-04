"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Sparkles,
  Zap,
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
  { key: "ask", label: "Direct Chat", icon: MessageSquare, description: "Direct local LLM reasoning" },
  { key: "analyze", label: "Doc Analysis", icon: FileSearch, description: "Extract key findings & risks" },
  { key: "knowledge", label: "Vector RAG", icon: Search, description: "Grounded neural vector store" },
  { key: "agent", label: "Sandboxed Agent", icon: Bot, description: "Autonomous pipeline task" },
] as const;

type Mode = (typeof MODES)[number]["key"];

const DEFAULT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
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

  // Auto-resize textarea
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  return (
    <div className={cn("w-full transition-all duration-300", hero ? "max-w-3xl" : "max-w-4xl mx-auto")}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border transition-all duration-300",
          "bg-slate-900/80 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
          dragOver
            ? "border-cyan-400 bg-cyan-950/30 ring-4 ring-cyan-500/20"
            : focused
            ? "border-cyan-500/60 ring-4 ring-cyan-500/15 shadow-[0_0_24px_rgba(6,182,212,0.2)]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        {/* Top bar: Mode Selector with Spring Motion */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2 bg-slate-950/50 rounded-t-2xl">
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
                    "relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold select-none cursor-pointer transition-colors whitespace-nowrap",
                    isActive
                      ? "text-cyan-300"
                      : "text-slate-400 hover:text-white",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="composer-mode-pill"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-950/80 via-slate-900 to-indigo-950/60 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                    />
                  )}
                  <Icon
                    size={13}
                    className={cn(
                      "relative z-10 transition-colors",
                      isActive ? "text-cyan-400" : "text-slate-400",
                    )}
                  />
                  <span className="relative z-10">{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
            <span>Shift+Enter = newline</span>
          </div>
        </div>

        {/* Attachment chips */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2 px-4 pt-3"
            >
              {files.map((file, i) => (
                <AttachmentChip
                  key={`${file.name}-${i}`}
                  file={file}
                  onRemove={() => removeFile(i)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text input area */}
        <div className="px-4 py-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              mode === "ask"
                ? "Ask a question or request assistance from local models..."
                : mode === "analyze"
                ? "Attach documents above or ask to analyze specific document insights..."
                : mode === "knowledge"
                ? "Search semantic knowledge vectors with source citations..."
                : "Describe a multi-step engineering or calculation task..."
            }
            rows={hero ? 2 : 1}
            disabled={disabled}
            className={cn(
              "w-full resize-none bg-transparent outline-none",
              "text-white placeholder:text-slate-500",
              hero ? "text-sm md:text-base leading-relaxed" : "text-sm leading-normal",
            )}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3.5 pb-3 pt-1">
          <div className="flex items-center gap-2">
            {/* File Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptStr}
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
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-300",
                "bg-slate-800/60 hover:bg-slate-700/80 hover:text-white border border-white/10 hover:border-cyan-500/30",
                "transition-all duration-150 cursor-pointer shadow-xs",
              )}
              title={`Attach files (${extensions.join(", ")})`}
            >
              <Paperclip size={13} className="text-cyan-400" />
              <span className="text-[11px] font-semibold">Attach Document</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Send button */}
            <motion.button
              whileHover={{ scale: canSend ? 1.05 : 1 }}
              whileTap={{ scale: canSend ? 0.95 : 1 }}
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer",
                canSend
                  ? "bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-600 text-white shadow-[0_0_16px_rgba(6,182,212,0.4)] border border-cyan-300/40 hover:opacity-95"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5",
              )}
              title="Send prompt (Enter)"
            >
              {disabled ? (
                <Loader2 size={15} className="animate-spin text-white" />
              ) : (
                <ArrowUp size={16} strokeWidth={2.4} />
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
