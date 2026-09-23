"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import SovereignStatus from "./SovereignStatus";
import { ChevronDown, ChevronRight, Clock, Terminal, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface TimelineStep {
  id?: string;
  step_number?: number;
  tool_name?: string;
  action_description?: string;
  timestamp?: string;
  title?: string;
  description?: string;
  status?: "pending" | "running" | "completed" | "failed" | "operational" | "active" | "error" | "standby";
  duration_ms?: number;
  parameters?: Record<string, unknown>;
  observation?: unknown;
  meta?: string;
  error?: string;
}

export interface SovereignTimelineProps {
  steps?: TimelineStep[];
  items?: TimelineStep[];
  className?: string;
  onInspectStep?: (step: TimelineStep) => void;
}

const stepVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.06,
      type: "spring" as const,
      stiffness: 300,
      damping: 25,
    },
  }),
};

export default function SovereignTimeline({
  steps,
  items,
  className,
  onInspectStep,
}: SovereignTimelineProps) {
  const allSteps = steps || items || [];
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  const toggleExpand = (idx: number) => {
    setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!allSteps || allSteps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-[#64818E]/70 font-mono text-xs border border-dashed border-[#64818E]/15 rounded-2xl bg-white/50 backdrop-blur-md">
        <Clock className="h-6 w-6 text-[#64818E]/50 mb-2" />
        <span>No execution steps recorded in timeline.</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 font-mono", className)}>
      {allSteps.map((s, idx) => {
        const isExpanded = !!expandedSteps[idx];
        const isLast = idx === allSteps.length - 1;
        const stepNum = s.step_number ?? idx + 1;
        const displayName = s.tool_name || s.title || `Step ${stepNum}`;
        const displayDesc = s.action_description || s.description;

        const isActive = s.status === "running" || s.status === "active";
        const isComplete = s.status === "completed" || s.status === "operational";
        const isFailed = s.status === "failed" || s.status === "error";

        return (
          <motion.div
            key={s.id || idx}
            custom={idx}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stepVariants}
            className="relative group"
          >
            {/* Timeline connector line */}
            {!isLast && (
              <div
                className={cn(
                  "absolute left-4 top-8 bottom-[-14px] w-px transition-colors duration-300",
                  isComplete
                    ? "bg-gradient-to-b from-[#047857]/50 to-[#047857]/10"
                    : isActive
                    ? "bg-gradient-to-b from-[#64818E]/50 to-[#64818E]/10"
                    : "bg-[#64818E]/15 group-hover:bg-[#64818E]/30"
                )}
              />
            )}

            <div
              className={cn(
                "rounded-2xl border transition-all duration-200 overflow-hidden glass-hover-lift",
                isActive
                  ? "border-[#64818E]/40 bg-[#64818E]/8 shadow-[0_0_25px_rgba(100,129,142,0.2)]"
                  : isFailed
                  ? "border-[#be123c]/30 bg-[#be123c]/8 shadow-[0_0_20px_rgba(190,18,60,0.15)]"
                  : isComplete
                  ? "border-[#047857]/25 bg-[#047857]/6 hover:border-[#047857]/40"
                  : "border-[#64818E]/15 bg-white/70 hover:border-[#64818E]/25 surface-level-1"
              )}
            >
              {/* Step Header Bar */}
              <div
                onClick={() => toggleExpand(idx)}
                className="flex items-center justify-between p-4 cursor-pointer select-none bg-[#C9D0D8]/15 hover:bg-[#C9D0D8]/25 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Step Number Dot */}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-extrabold text-xs border transition-all",
                      isComplete
                        ? "border-[#047857]/50 bg-[#047857]/15 text-[#047857] shadow-[0_0_12px_rgba(4,120,87,0.3)]"
                        : isActive
                        ? "border-[#64818E]/50 bg-[#64818E]/20 text-[#64818E] shadow-[0_0_12px_rgba(100,129,142,0.5)] animate-pulse"
                        : isFailed
                        ? "border-[#be123c]/50 bg-[#be123c]/15 text-[#be123c]"
                        : "border-[#64818E]/15 bg-[#64818E]/6 text-[#64818E]/70"
                    )}
                  >
                    {isComplete ? (
                      <Zap className="h-3.5 w-3.5" />
                    ) : (
                      stepNum
                    )}
                  </div>

                  {/* Tool / Action Name */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#192730] truncate">
                        {displayName}
                      </span>
                      {s.status && (
                        <SovereignStatus
                          status={
                            isComplete
                              ? "operational"
                              : isActive
                              ? "active"
                              : isFailed
                              ? "error"
                              : "standby"
                          }
                          label={s.status.toUpperCase()}
                          size="xs"
                        />
                      )}
                    </div>
                    {displayDesc && (
                      <span className="text-[11px] text-[#64818E]/70 font-sans truncate mt-0.5">
                        {displayDesc}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Metrics / Toggle */}
                <div className="flex items-center gap-2.5 shrink-0 text-xs text-[#64818E]/70">
                  {s.timestamp && (
                    <span className="text-[10px] text-[#64818E]/50">{s.timestamp}</span>
                  )}
                  {s.duration_ms !== undefined && (
                    <span
                      className={cn(
                        "text-[11px] font-bold px-1.5 py-0.5 rounded-md",
                        s.duration_ms < 100
                          ? "bg-[#047857]/10 text-[#047857] border border-[#047857]/25"
                          : s.duration_ms < 500
                          ? "bg-[#b45309]/10 text-[#b45309] border border-[#b45309]/25"
                          : "bg-[#be123c]/10 text-[#be123c] border border-[#be123c]/25"
                      )}
                    >
                      {s.duration_ms}ms
                    </span>
                  )}
                  {onInspectStep && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectStep(s);
                      }}
                      title="Inspect Step Trace"
                      className="p-1.5 rounded-lg text-[#64818E]/70 hover:text-[#64818E] hover:bg-[#64818E]/10 transition-colors cursor-pointer"
                    >
                      <Terminal className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  >
                    <ChevronRight className="h-4 w-4 text-[#64818E]/60" />
                  </motion.div>
                </div>
              </div>

              {/* Expanded JSON / Arguments / Output Payload */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="border-t border-[#64818E]/15 bg-[#C9D0D8]/30 p-4 text-xs space-y-3"
                  >
                    {s.meta && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[#64818E]/70 block mb-1 font-bold">
                          Metadata:
                        </span>
                        <pre className="p-3 rounded-xl bg-[#192730]/6 border border-[#64818E]/15 text-[11px] text-[#64818E] overflow-x-auto whitespace-pre-wrap font-mono">
                          {s.meta}
                        </pre>
                      </div>
                    )}

                    {s.parameters && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[#64818E]/70 block mb-1 font-bold">
                          Parameters:
                        </span>
                        <pre className="p-3 rounded-xl bg-[#192730]/6 border border-[#64818E]/15 text-[11px] text-[#64818E] overflow-x-auto font-mono">
                          {JSON.stringify(s.parameters, null, 2)}
                        </pre>
                      </div>
                    )}

                    {s.observation !== undefined && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[#64818E]/70 block mb-1 font-bold">
                          Observation:
                        </span>
                        <pre className="p-3 rounded-xl bg-[#192730]/6 border border-[#047857]/15 text-[11px] text-[#047857] overflow-x-auto font-mono">
                          {typeof s.observation === "string"
                            ? s.observation
                            : JSON.stringify(s.observation, null, 2)}
                        </pre>
                      </div>
                    )}

                    {s.error && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[#be123c] block mb-1 font-bold">
                          Error Diagnostic:
                        </span>
                        <pre className="p-3 rounded-xl bg-[#be123c]/10 border border-[#be123c]/20 text-[11px] text-[#be123c] overflow-x-auto font-mono">
                          {s.error}
                        </pre>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
