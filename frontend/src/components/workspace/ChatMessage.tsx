"use client";

import React, { useState } from "react";
import { cn, formatRelativeTime, copyToClipboard } from "@/lib/utils";
import type {
  Citation,
  EvidenceQuality,
  TraceEvent,
  PlanStepItem,
  ToolCallItem,
} from "@/lib/api/types";
import {
  Copy,
  Check,
  ChevronRight,
  User2,
  Download,
  Sparkles,
  Bot,
  Zap,
  Code2,
  FileText,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { exportToDocx } from "@/lib/api/client";
import EvidenceBadge from "./EvidenceBadge";
import SourceCitation from "./SourceCitation";
import ExecutionDetails from "./ExecutionDetails";
import ExecutionTimeline from "./ExecutionTimeline";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  evidenceQuality?: EvidenceQuality;
  model?: string;
  provider?: string;
  retrievalTime?: number;
  generationTime?: number;
  totalTime?: number;
  tokensUsed?: number | null;
  fallbackUsed?: boolean;
  trace?: TraceEvent[];
  plan?: PlanStepItem[];
  toolCalls?: ToolCallItem[];
  verification?: Record<string, unknown>;
  attachments?: { name: string; type: string; size: number }[];
  timestamp?: string;
  onSelectCitation?: (citation: Citation) => void;
  onFollowUp?: (prompt: string) => void;
}

// ── Code Block Component with Copy ─────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-stone-800 bg-[#121110] text-stone-100 overflow-hidden shadow-sm">
      {/* Code Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-stone-800/80 bg-stone-900/60 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Code2 size={13} className="text-teal-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-300">
            {language || "code"}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code Body */}
      <div className="p-4 font-mono text-[12px] leading-relaxed overflow-x-auto select-text text-stone-200">
        <code>{code}</code>
      </div>
    </div>
  );
}

// ── Markdown Content Renderer ──────────────────────────────────────────────

function renderContent(content: string) {
  const paragraphs = content.split(/\n{2,}/);

  return paragraphs.map((paragraph, pIdx) => {
    const trimmed = paragraph.trim();

    // Headings
    if (trimmed.startsWith("### ")) {
      return (
        <h4 key={pIdx} className="text-xs font-bold uppercase tracking-wider text-[var(--color-wb-text)] mt-4 mb-1.5 first:mt-0">
          {trimmed.slice(4)}
        </h4>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={pIdx} className="text-sm font-bold text-[var(--color-wb-text)] mt-4 mb-2 first:mt-0 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-teal-600 inline-block" />
          {trimmed.slice(3)}
        </h3>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={pIdx} className="text-base font-bold text-[var(--color-wb-text)] mt-5 mb-2.5 first:mt-0">
          {trimmed.slice(2)}
        </h2>
      );
    }

    // Code blocks
    if (trimmed.startsWith("```")) {
      const match = trimmed.match(/^```(\w+)?\n?([\s\S]*?)\n?```$/);
      const language = match ? match[1] || "" : "";
      const code = match ? match[2] : trimmed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return <CodeBlock key={pIdx} code={code} language={language} />;
    }

    // Bullet list detection
    const lines = paragraph.split(/\n/);
    const isBulletList = lines.every(
      (l) => l.trim().startsWith("- ") || l.trim().startsWith("* ") || l.trim().startsWith("• ") || l.trim() === "",
    );

    if (isBulletList && lines.some((l) => l.trim().length > 0)) {
      return (
        <ul key={pIdx} className="space-y-1.5 my-2.5">
          {lines
            .filter((l) => l.trim().length > 0)
            .map((line, lIdx) => (
              <li
                key={lIdx}
                className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--color-wb-text-secondary)]"
              >
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal-600/70 shrink-0" />
                <div>{formatInlineText(line.replace(/^[\-\*\•]\s+/, ""))}</div>
              </li>
            ))}
        </ul>
      );
    }

    // Regular paragraph
    return (
      <p key={pIdx} className="text-xs leading-[1.75] text-[var(--color-wb-text-secondary)] mb-2.5 last:mb-0">
        {lines.map((line, lIdx) => (
          <React.Fragment key={lIdx}>
            {lIdx > 0 && <br />}
            {formatInlineText(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function formatInlineText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const boldIdx = boldMatch?.index ?? Infinity;
    const codeIdx = codeMatch?.index ?? Infinity;

    if (boldIdx === Infinity && codeIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (boldIdx <= codeIdx && boldMatch) {
      parts.push(remaining.slice(0, boldIdx));
      parts.push(
        <strong key={key++} className="font-semibold text-[var(--color-wb-text)]">
          {boldMatch[1]}
        </strong>,
      );
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (codeMatch) {
      parts.push(remaining.slice(0, codeIdx));
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded-md bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border)] text-teal-800 dark:text-teal-300 text-[11px] font-mono font-medium"
        >
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    }
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ── Smart Follow-up Suggestions Generator ──────────────────────────────────

function getSuggestionsForContent(content: string): string[] {
  const lower = content.toLowerCase();
  if (lower.includes("risk") || lower.includes("finding")) {
    return [
      "Draft executive summary of findings",
      "Suggest mitigation strategies for these risks",
      "Export as structured compliance note",
    ];
  }
  if (lower.includes("code") || lower.includes("def ") || lower.includes("import ")) {
    return [
      "Write unit tests for this code",
      "Explain time & space complexity",
      "Execute inside sandboxed container",
    ];
  }
  if (lower.includes("procedure") || lower.includes("step")) {
    return [
      "Provide step-by-step checklist",
      "Check against safety protocols",
    ];
  }
  return [
    "Elaborate in deeper detail",
    "Summarize into key takeaways",
  ];
}

export default function ChatMessage({
  role,
  content,
  citations,
  evidenceQuality,
  model,
  provider,
  retrievalTime,
  generationTime,
  totalTime,
  tokensUsed,
  fallbackUsed,
  trace,
  attachments,
  timestamp,
  onSelectCitation,
  onFollowUp,
}: ChatMessageProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const isUser = role === "user";

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleExportDocx = async () => {
    try {
      setExporting(true);
      const blob = await exportToDocx({
        title: "Sovereign AI Executive Response",
        content,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sovereign_response_${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Best effort
    } finally {
      setExporting(false);
    }
  };

  // ── User message bubble ──────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1.5 max-w-2xl ml-auto">
        <div className="flex items-center gap-2 mr-1">
          {timestamp && (
            <span className="text-[10px] text-[var(--color-wb-text-faint)] font-mono tabular-nums">
              {formatRelativeTime(timestamp)}
            </span>
          )}
          <span className="text-[11px] font-semibold text-[var(--color-wb-text-muted)]">
            You
          </span>
        </div>

        <div className="rounded-2xl rounded-tr-xs px-4 py-3 bg-[var(--color-wb-sidebar)] text-white text-xs leading-relaxed shadow-sm border border-stone-800">
          {content}
        </div>

        {/* Attachment chips */}
        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end mt-1">
            {attachments.map((att, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] bg-[var(--color-wb-surface)] border border-[var(--color-wb-border)] text-[var(--color-wb-text-secondary)] shadow-2xs font-mono"
              >
                <FileText size={11} className="text-teal-600" />
                <span className="truncate max-w-[140px] font-medium">{att.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Assistant message ────────────────────────────────────────────────────
  const hasCitations = citations && citations.length > 0;
  const hasTrace = trace && trace.length > 0;
  const suggestions = getSuggestionsForContent(content);

  return (
    <div className="flex gap-3 max-w-full group">
      {/* Avatar column */}
      <div className="shrink-0 mt-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 border border-teal-400/30 text-white shadow-[0_0_12px_rgba(15,118,110,0.2)]">
          <Sparkles size={15} />
        </div>
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-wb-border-subtle)] pb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-wb-text)]">
              Sovereign Core
            </span>
            {model && (
              <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 font-semibold">
                {model === "general" ? "Gemma 3 4B" : model}
              </span>
            )}
            {totalTime && (
              <span className="text-[10px] font-mono text-[var(--color-wb-text-muted)] flex items-center gap-0.5">
                <Zap size={10} className="text-teal-600" />
                {(totalTime / 1000).toFixed(2)}s
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {timestamp && (
              <span className="text-[10px] text-[var(--color-wb-text-faint)] font-mono tabular-nums mr-1">
                {formatRelativeTime(timestamp)}
              </span>
            )}

            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-[var(--color-wb-text-muted)] hover:text-[var(--color-wb-text)] hover:bg-[var(--color-wb-surface-hover)] border border-transparent hover:border-[var(--color-wb-border)] transition-colors cursor-pointer"
              title="Copy response"
            >
              {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            </button>

            <button
              onClick={handleExportDocx}
              disabled={exporting}
              className="p-1.5 rounded-lg text-[var(--color-wb-text-muted)] hover:text-[var(--color-wb-text)] hover:bg-[var(--color-wb-surface-hover)] border border-transparent hover:border-[var(--color-wb-border)] transition-colors cursor-pointer"
              title="Export as Microsoft Word (.docx)"
            >
              <Download size={13} />
            </button>
          </div>
        </div>

        {/* Markdown Rendered Content */}
        <div className="prose-workbench">
          {renderContent(content)}
        </div>

        {/* Evidence Quality Badge */}
        {evidenceQuality && (
          <EvidenceBadge
            quality={evidenceQuality}
            showDescription
            sourceCount={citations?.length}
          />
        )}

        {/* Citations Grid */}
        {hasCitations && (
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-wb-text-muted)] block">
              Grounded Sources ({citations.length})
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {citations.map((c, idx) => (
                <div
                  key={c.chunk_id ?? idx}
                  onClick={() => onSelectCitation?.(c)}
                  className="cursor-pointer"
                >
                  <SourceCitation citation={c} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Execution details */}
        {model && (
          <ExecutionDetails
            model={model}
            provider={provider}
            retrievalTime={retrievalTime}
            generationTime={generationTime}
            totalTime={totalTime}
            tokensUsed={tokensUsed}
            fallbackUsed={fallbackUsed}
          />
        )}

        {/* Execution timeline */}
        {hasTrace && (
          <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => setTimelineOpen((v) => !v)}
              className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--color-wb-text)] hover:bg-[var(--color-wb-surface-hover)] transition-colors cursor-pointer select-none"
            >
              <ChevronRight
                size={14}
                className={cn("text-[var(--color-wb-text-muted)] transition-transform", timelineOpen && "rotate-90")}
              />
              <span>Agent Execution Pipeline</span>
              <span className="ml-auto text-[10px] font-mono text-teal-600 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                {trace.length} operations verified
              </span>
            </button>

            {timelineOpen && (
              <div className="border-t border-[var(--color-wb-border)] p-4 bg-[var(--color-wb-bg-inset)]/40">
                <ExecutionTimeline trace={trace} />
              </div>
            )}
          </div>
        )}

        {/* Smart Follow-up Suggestions */}
        {onFollowUp && suggestions.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-[var(--color-wb-text-muted)] mr-1">
              Suggested:
            </span>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onFollowUp(s)}
                className="text-left text-[11px] px-2.5 py-1 rounded-lg bg-[var(--color-wb-surface)] hover:bg-teal-500/10 border border-[var(--color-wb-border)] hover:border-teal-500/30 text-[var(--color-wb-text-secondary)] hover:text-teal-700 transition-colors cursor-pointer shadow-2xs"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
