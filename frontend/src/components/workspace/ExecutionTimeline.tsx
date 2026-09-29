"use client";

import React from "react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { TraceEvent } from "@/lib/api/types";
import { Check, X, Loader2, ArrowRight, Cpu, CircleDot } from "lucide-react";

interface ExecutionTimelineProps {
  trace: TraceEvent[];
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventIcon(eventType: string) {
  const completed = ["task_completed", "tool_completed", "verification_completed"];
  const failed = ["task_failed", "tool_failed"];
  const started = ["tool_started", "verification_started"];
  const routing = ["task_routed", "plan_created"];

  if (completed.includes(eventType))
    return <Check size={10} strokeWidth={2.5} className="text-[var(--color-wb-success)]" />;
  if (failed.includes(eventType))
    return <X size={10} strokeWidth={2.5} className="text-[var(--color-wb-error)]" />;
  if (started.includes(eventType))
    return <Loader2 size={10} className="text-[var(--color-wb-accent)] animate-spin-smooth" />;
  if (eventType === "task_received")
    return <ArrowRight size={10} className="text-[var(--color-wb-text-faint)]" />;
  if (routing.includes(eventType))
    return <Cpu size={10} className="text-[var(--color-wb-accent)]" />;
  return <CircleDot size={10} className="text-[var(--color-wb-text-faint)]" />;
}

function getStatusColor(eventType: string): string {
  const completed = ["task_completed", "tool_completed", "verification_completed"];
  const failed = ["task_failed", "tool_failed"];
  const started = ["tool_started", "verification_started"];

  if (completed.includes(eventType)) return "bg-[var(--color-wb-success)]";
  if (failed.includes(eventType)) return "bg-[var(--color-wb-error)]";
  if (started.includes(eventType)) return "bg-[var(--color-wb-accent)]";
  return "bg-[var(--color-wb-border-strong)]";
}

export default function ExecutionTimeline({ trace }: ExecutionTimelineProps) {
  if (!trace || trace.length === 0) return null;

  return (
    <div className="relative pl-5">
      {/* Vertical connecting line */}
      <div className="absolute left-[9px] top-1 bottom-1 w-px bg-[var(--color-wb-border)]" />

      <div className="space-y-0.5">
        {trace.map((event, idx) => {
          const eventType = event.event_type;
          const isLast = idx === trace.length - 1;

          return (
            <div
              key={`${event.run_id}-${eventType}-${idx}`}
              className={cn("stagger-item relative flex items-center gap-3 py-1.5")}
            >
              {/* Status dot */}
              <div className="absolute left-[-13px] flex items-center justify-center">
                <span
                  className={cn(
                    "h-[7px] w-[7px] rounded-full ring-2 ring-[var(--color-wb-bg)]",
                    getStatusColor(eventType),
                  )}
                />
              </div>

              {/* Icon */}
              <span className="flex shrink-0 items-center justify-center w-5 h-5 rounded bg-[var(--color-wb-bg-inset)]">
                {getEventIcon(eventType)}
              </span>

              {/* Label */}
              <span className="text-[12px] font-medium text-[var(--color-wb-text)]">
                {formatEventType(eventType)}
              </span>

              {/* Timestamp */}
              <span className="ml-auto text-[10px] text-[var(--color-wb-text-faint)] font-mono tabular-nums">
                {formatRelativeTime(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
