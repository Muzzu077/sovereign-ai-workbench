"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Activity, ShieldCheck, Cpu, Database, Zap, Lock } from "lucide-react";
import type { HealthResponse } from "@/lib/api/types";

interface SovereignTelemetryProps {
  health: HealthResponse | null;
  latency?: number;
  className?: string;
  variant?: "strip" | "cluster";
}

export default function SovereignTelemetry({
  health,
  latency = 120,
  className,
  variant = "strip",
}: SovereignTelemetryProps) {
  if (variant === "cluster") {
    return (
      <div
        className={cn(
          "grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl border border-[#64818E]/15 bg-white/80 backdrop-blur-xl font-mono text-xs",
          className
        )}
      >
        <div className="flex flex-col gap-1 p-2 rounded-lg bg-[#C9D0D8]/20 border border-[#64818E]/10">
          <span className="text-[10px] uppercase text-[#64818E]/70 flex items-center gap-1.5">
            <Database className="h-3 w-3 text-[#64818E]" /> Vectors
          </span>
          <span className="text-base font-bold text-[#192730]">
            {health?.knowledge_chunks ?? 0}
          </span>
          <span className="text-[9px] text-[#64818E]/70">FAISS / Local</span>
        </div>

        <div className="flex flex-col gap-1 p-2 rounded-lg bg-[#C9D0D8]/20 border border-[#64818E]/10">
          <span className="text-[10px] uppercase text-[#64818E]/70 flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-[#1e6b7b]" /> Models
          </span>
          <span className="text-base font-bold text-[#192730]">
            {health?.models_registered?.length ?? 0}
          </span>
          <span className="text-[9px] text-[#64818E]/70">Local Weight</span>
        </div>

        <div className="flex flex-col gap-1 p-2 rounded-lg bg-[#C9D0D8]/20 border border-[#64818E]/10">
          <span className="text-[10px] uppercase text-[#64818E]/70 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-[#b45309]" /> Latency
          </span>
          <span className="text-base font-bold text-[#b45309]">{latency} ms</span>
          <span className="text-[9px] text-[#64818E]/70">Local IPC</span>
        </div>

        <div className="flex flex-col gap-1 p-2 rounded-lg bg-[#C9D0D8]/20 border border-[#64818E]/10">
          <span className="text-[10px] uppercase text-[#64818E]/70 flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-[#047857]" /> Security
          </span>
          <span className="text-sm font-bold text-[#047857]">127.0.0.1</span>
          <span className="text-[9px] text-[#047857]/80">AIR-GAPPED</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-[#64818E]/15 bg-white/80 px-3 py-1.5 font-mono text-[11px] text-[#64818E] backdrop-blur-xl",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-[#047857] font-semibold">
        <span className="h-1.5 w-1.5 rounded-full bg-[#047857] animate-status-pulse" />
        <span>ISOLATED</span>
      </div>

      <span className="text-[#64818E]/25">|</span>

      <div className="flex items-center gap-1.5">
        <span className="text-[#64818E]/70 uppercase text-[10px]">Vectors:</span>
        <span className="font-bold text-[#64818E]">{health?.knowledge_chunks ?? 0}</span>
      </div>

      <span className="text-[#64818E]/25">|</span>

      <div className="flex items-center gap-1.5">
        <span className="text-[#64818E]/70 uppercase text-[10px]">Models:</span>
        <span className="font-bold text-[#1e6b7b]">
          {health?.models_registered?.length ?? 0}
        </span>
      </div>

      <span className="text-[#64818E]/25">|</span>

      <div className="flex items-center gap-1.5">
        <span className="text-[#64818E]/70 uppercase text-[10px]">Ping:</span>
        <span className="font-bold text-[#b45309]">{latency}ms</span>
      </div>
    </div>
  );
}
