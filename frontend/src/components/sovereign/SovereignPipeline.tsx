"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export interface PipelineStage {
  id: string;
  label: string;
  description?: string;
  status: "idle" | "active" | "completed" | "error";
  icon?: React.ReactNode;
  meta?: string;
}

interface SovereignPipelineProps {
  stages: PipelineStage[];
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export default function SovereignPipeline({
  stages,
  orientation = "horizontal",
  className,
}: SovereignPipelineProps) {
  if (orientation === "vertical") {
    return (
      <div className={cn("space-y-2 font-mono", className)}>
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1;
          return (
            <div key={stage.id} className="relative flex items-start gap-3">
              {!isLast && (
                <div className="absolute left-3.5 top-7 bottom-[-8px] w-px bg-[#64818E]/15" />
              )}
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-all",
                  stage.status === "completed"
                    ? "border-[#047857]/40 bg-[#047857]/10 text-[#047857]"
                    : stage.status === "active"
                    ? "border-[#64818E]/50 bg-[#64818E]/20 text-[#64818E] animate-status-pulse"
                    : stage.status === "error"
                    ? "border-[#be123c]/50 bg-[#be123c]/20 text-[#be123c]"
                    : "border-[#64818E]/15 bg-[#64818E]/6 text-[#64818E]/70"
                )}
              >
                {stage.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : stage.status === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : stage.status === "error" ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>

              <div className="flex-1 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      stage.status === "active"
                        ? "text-[#64818E]"
                        : stage.status === "completed"
                        ? "text-[#2d404a]"
                        : "text-[#64818E]/70"
                    )}
                  >
                    {stage.label}
                  </span>
                  {stage.meta && (
                    <span className="text-[10px] text-[#64818E]/70 font-sans">{stage.meta}</span>
                  )}
                </div>
                {stage.description && (
                  <p className="text-[11px] text-[#64818E]/70 font-sans mt-0.5">
                    {stage.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr gap-2 font-mono",
        className
      )}
    >
      {stages.map((stage, idx) => {
        return (
          <div
            key={stage.id}
            className={cn(
              "relative flex flex-col justify-between p-3 rounded-xl border transition-all duration-200 overflow-hidden",
              stage.status === "completed"
                ? "border-[#047857]/25 bg-[#047857]/8 text-[#047857]"
                : stage.status === "active"
                ? "border-[#64818E]/40 bg-[#64818E]/10 text-[#64818E] shadow-lg shadow-[#64818E]/15"
                : stage.status === "error"
                ? "border-[#be123c]/30 bg-[#be123c]/8 text-[#be123c]"
                : "border-[#64818E]/15 bg-white/60 text-[#64818E]/70"
            )}
          >
            {/* Active stage top scanline */}
            {stage.status === "active" && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[#64818E] animate-pipeline-flow" />
            )}

            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                Stage 0{idx + 1}
              </span>
              {stage.status === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[#047857]" />
              ) : stage.status === "active" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#64818E]" />
              ) : null}
            </div>

            <span className="text-xs font-semibold text-[#192730] uppercase tracking-tight truncate">
              {stage.label}
            </span>

            {stage.description && (
              <span className="text-[10px] text-[#64818E]/70 font-sans truncate mt-0.5">
                {stage.description}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
