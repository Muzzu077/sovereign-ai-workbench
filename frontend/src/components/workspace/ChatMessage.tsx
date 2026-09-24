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
import { Copy, Check, ChevronRight, User2 } from "lucide-react";
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
}

function renderContent(content: string) {
  const paragraphs = content.split(/\n{2,}/);

  return paragraphs.map((paragraph, pIdx) => {
    const trimmed = paragraph.trim();

    // Heading detection (## Heading or **Heading**)
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={pIdx} className="text-[13px] font-semibold text-[var(--color-wb-text)] mt-4 mb-1.5 first:mt-0">
          {trimmed.slice(3)}
        </h3>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={pIdx} className="text-sm font-bold text-[var(--color-wb-text)] mt-4 mb-1.5 first:mt-0">
          {trimmed.slice(2)}
        </h2>
      );
    }

    // Bullet list detection
    const lines = paragraph.split(/\n/);
    const isBulletList = lines.every(
      (l) => l.trim().startsWith("- ") || l.trim().startsWith("* ") || l.trim().startsWith("• ") || l.trim() === ""
    );

    if (isBulletList && lines.some((l) => l.trim().length > 0)) {
      return (
        <ul key={pIdx} className="space-y-1 my-2">
          {lines
            .filter((l) => l.trim().length > 0)
            .map((line, lIdx) => (
              <li
                key={lIdx}
                className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--color-wb-text-secondary)]"
              >
                <span className="mt-2 h-1 w-1 rounded-full bg-[var(--color-wb-text-faint)] shrink-0" />
                <span>{formatInlineText(line.replace(/^[\-\*\•]\s+/, ""))}</span>
              </li>
            ))}
        </ul>
      );
    }

    // Numbered list detection
    const isNumberedList = lines.every(
      (l) => /^\d+[\.\)]\s/.test(l.trim()) || l.trim() === ""
    );

    if (isNumberedList && lines.some((l) => l.trim().length > 0)) {
      return (
        <ol key={pIdx} className="space-y-1 my-2 list-decimal list-inside">
          {lines
            .filter((l) => l.trim().length > 0)
            .map((line, lIdx) => (
              <li
                key={lIdx}
                className="text-[13px] leading-relaxed text-[var(--color-wb-text-secondary)]"
              >
                {formatInlineText(line.replace(/^\d+[\.\)]\s+/, ""))}
              </li>
            ))}
        </ol>
      );
    }

    // Code block detection
    if (trimmed.startsWith("```")) {
      const codeContent = trimmed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return (
        <pre
          key={pIdx}
          className="my-2 rounded-md bg-[var(--color-wb-sidebar)] text-[var(--color-wb-text-inverse)] px-3.5 py-3 text-[12px] font-mono leading-relaxed overflow-x-auto"
        >
          <code>{codeContent}</code>
        </pre>
      );
    }

    // Regular paragraph
    return (
      <p key={pIdx} className="text-[13px] leading-[1.7] text-[var(--color-wb-text-secondary)] mb-2 last:mb-0">
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
  // Handle **bold** and `code` inline formatting
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
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
        </strong>
      );
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (codeMatch) {
      parts.push(remaining.slice(0, codeIdx));
      parts.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-[var(--color-wb-bg-inset)] text-[var(--color-wb-text)] text-[12px] font-mono"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    }
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
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
}: ChatMessageProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // ── User message ──────────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {/* Timestamp */}
        {timestamp && (
          <span className="text-[10px] text-[var(--color-wb-text-faint)] font-mono tabular-nums mr-1">
            {formatRelativeTime(timestamp)}
          </span>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%]",
            "bg-[var(--color-wb-sidebar)] text-[var(--color-wb-text-inverse)]",
            "text-[13px] leading-relaxed",
          )}
        >
          {content}
        </div>

        {/* Attachments */}
        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-end">
            {attachments.map((att, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] text-[var(--color-wb-text-muted)]"
              >
                <span className="font-mono uppercase font-semibold text-[9px]">
                  {att.type}
                </span>
                <span className="truncate max-w-[120px]">{att.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Assistant message ─────────────────────────────────────────────────
  const hasCitations = citations && citations.length > 0;
  const hasTrace = trace && trace.length > 0;
  const hasExecDetails = model && provider;

  return (
    <div className="flex gap-3 max-w-full">
      {/* Avatar column */}
      <div className="shrink-0 mt-0.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-wb-accent-subtle)] border border-[var(--color-wb-accent-muted)]">
          <span className="text-[10px] font-bold text-[var(--color-wb-accent)]">AI</span>
        </div>
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--color-wb-text)]">
            Sovereign AI
          </span>
          {timestamp && (
            <span className="text-[10px] text-[var(--color-wb-text-faint)] font-mono tabular-nums">
              {formatRelativeTime(timestamp)}
            </span>
          )}

          {/* Copy action */}
          <button
            onClick={handleCopy}
            className={cn(
              "ml-auto p-1 rounded-md wb-interactive",
              "text-[var(--color-wb-text-faint)]",
              "opacity-0 group-hover:opacity-100 hover:opacity-100",
              "hover:text-[var(--color-wb-text)] hover:bg-[var(--color-wb-surface-hover)]",
            )}
            aria-label="Copy response"
          >
            {copied ? (
              <Check size={13} className="text-[var(--color-wb-success)]" />
            ) : (
              <Copy size={13} />
            )}
          </button>
        </div>

        {/* Main content */}
        <div className="prose-workbench">
          {renderContent(content)}
        </div>

        {/* Evidence badge */}
        {evidenceQuality && (
          <EvidenceBadge
            quality={evidenceQuality}
            showDescription
            sourceCount={citations?.length}
          />
        )}

        {/* Citations */}
        {hasCitations && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-wb-text-faint)]">
              Sources
            </span>
            <div className="grid gap-1.5">
              {citations.map((c, idx) => (
                <SourceCitation key={c.chunk_id ?? idx} citation={c} />
              ))}
            </div>
          </div>
        )}

        {/* Execution details */}
        {hasExecDetails && (
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
          <div className="rounded-lg border border-[var(--color-wb-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setTimelineOpen((v) => !v)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-left wb-interactive",
                "text-xs text-[var(--color-wb-text-secondary)]",
                "hover:bg-[var(--color-wb-surface-hover)]",
                "select-none",
              )}
              aria-expanded={timelineOpen}
            >
              <ChevronRight
                size={13}
                className={cn(
                  "shrink-0 text-[var(--color-wb-text-faint)] wb-interactive",
                  timelineOpen && "rotate-90",
                )}
              />
              <span className="text-[11px] font-semibold text-[var(--color-wb-text-secondary)]">
                Execution Timeline
              </span>
              <span className="ml-auto text-[10px] text-[var(--color-wb-text-faint)] font-mono tabular-nums">
                {trace.length} steps
              </span>
            </button>

            {timelineOpen && (
              <div className="border-t border-[var(--color-wb-border)] px-3 py-3 bg-[var(--color-wb-bg-inset)] animate-slide-up">
                <ExecutionTimeline trace={trace} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
