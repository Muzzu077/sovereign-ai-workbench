"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import SovereignStatus from "./SovereignStatus";
import { Cpu, HardDrive, Zap, Shield, Sparkles, Check, Terminal, Eye } from "lucide-react";
import type { ModelInfo } from "@/lib/api/types";

export interface SovereignModelCardProps {
  model?: ModelInfo;
  name?: string;
  runtime?: string;
  contextTokens?: number;
  quantization?: string;
  acceleration?: string;
  status?: "operational" | "standby" | "active" | "error";
  tags?: string[];
  selected?: boolean;
  onSelect?: () => void;
  onTest?: () => void;
  onInspect?: () => void;
  className?: string;
}

export default function SovereignModelCard({
  model,
  name,
  runtime,
  contextTokens,
  quantization = "Q4_K_M (4-bit)",
  acceleration = "CPU / SIMD",
  status,
  tags = ["TEXT GEN", "RAG REASONING", "TOOL CALLING"],
  selected = false,
  onSelect,
  onTest,
  onInspect,
  className,
}: SovereignModelCardProps) {
  const modelName = name || model?.name || "Model";
  const modelRuntime = runtime || model?.provider_name || "llama.cpp";
  const modelCtx = contextTokens || model?.capabilities?.max_context_tokens || 8192;
  const isAvailable = status ? status === "operational" : model ? model.available !== false : true;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      whileHover={{ y: -2 }}
      onClick={onSelect}
      className={cn(
        "flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 backdrop-blur-xl group cursor-pointer",
        selected
          ? "border-[#64818E]/50 bg-gradient-to-br from-[#64818E]/12 to-[#9CAFBE]/10 shadow-[0_0_25px_rgba(100,129,142,0.2)] surface-level-3"
          : "border-[#64818E]/18 bg-white/80 hover:border-[#64818E]/35 hover:shadow-[0_0_18px_rgba(100,129,142,0.12)] surface-level-2",
        className
      )}
    >
      {/* Subtle top reflection */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#64818E]/12 to-transparent rounded-t-2xl" />

      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all",
                selected || isAvailable
                  ? "border-[#64818E]/40 bg-gradient-to-br from-[#64818E]/25 to-[#9CAFBE]/15 text-[#64818E] shadow-[0_0_12px_rgba(100,129,142,0.25)]"
                  : "border-[#64818E]/18 bg-[#64818E]/8 text-[#64818E]/60"
              )}
            >
              <Cpu className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-sm font-extrabold text-[#192730] uppercase tracking-tight truncate group-hover:text-[#64818E] transition-colors">
                {modelName}
              </span>
              <span className="text-[11px] text-[#64818E]/70 font-mono truncate flex items-center gap-1">
                <Zap className="h-3 w-3 text-[#64818E]" />
                {modelRuntime}
              </span>
            </div>
          </div>
          <SovereignStatus
            status={isAvailable ? "operational" : "standby"}
            label={isAvailable ? "ACTIVE" : "STANDBY"}
            size="xs"
          />
        </div>

        {/* Technical Specs Grid */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[#64818E]/15 font-mono text-[11px]">
          <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-[#64818E]/5 border border-[#64818E]/12 hover:bg-[#64818E]/10 transition-colors">
            <span className="text-[10px] uppercase text-[#64818E]/70 font-bold">Context Window</span>
            <span className="font-bold text-[#1e6b7b]">
              {modelCtx ? `${(modelCtx / 1024).toFixed(0)}K Tokens` : "8K Tokens"}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-[#64818E]/5 border border-[#64818E]/12 hover:bg-[#64818E]/10 transition-colors">
            <span className="text-[10px] uppercase text-[#64818E]/70 font-bold">Quantization</span>
            <span className="font-bold text-[#64818E] truncate">
              {quantization}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-[#64818E]/5 border border-[#64818E]/12 hover:bg-[#64818E]/10 transition-colors">
            <span className="text-[10px] uppercase text-[#64818E]/70 font-bold">Target Compute</span>
            <span className="font-bold text-[#047857]">
              {acceleration}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-[#64818E]/5 border border-[#64818E]/12 hover:bg-[#64818E]/10 transition-colors">
            <span className="text-[10px] uppercase text-[#64818E]/70 font-bold">Isolation</span>
            <span className="font-bold text-[#047857] flex items-center gap-1">
              <Shield className="h-3 w-3" /> STRICT OFFLINE
            </span>
          </div>
        </div>

        {/* Capabilities Chips */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-gradient-to-r from-[#64818E]/6 to-[#64818E]/3 border border-[#64818E]/15 px-2.5 py-0.5 font-mono text-[10px] text-[#2d404a] uppercase tracking-wider hover:border-[#64818E]/30 hover:text-[#64818E] transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#64818E]/15">
        <div className="font-mono text-[10px] text-[#64818E]/70 flex items-center gap-1.5">
          {isAvailable ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-[#047857] animate-pulse" />
              READY FOR INFERENCE
            </>
          ) : (
            "IDLE (LOADS ON DEMAND)"
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onInspect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInspect();
              }}
              className="flex items-center gap-1 rounded-xl border border-[#64818E]/15 bg-[#64818E]/8 px-2.5 py-1.5 text-xs text-[#64818E] hover:border-[#64818E]/35 hover:bg-[#64818E]/15 hover:text-[#192730] hover:shadow-[0_0_12px_rgba(100,129,142,0.15)] transition-all font-mono cursor-pointer"
            >
              <Eye className="h-3 w-3" />
              <span className="font-bold">INSPECT</span>
            </button>
          )}
          {onTest && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTest();
              }}
              className="flex items-center gap-1 rounded-xl border border-[#64818E]/30 bg-[#64818E]/12 px-2.5 py-1.5 text-xs text-[#192730] hover:border-[#64818E]/50 hover:bg-[#64818E]/20 hover:shadow-[0_0_15px_rgba(100,129,142,0.2)] transition-all font-mono cursor-pointer"
            >
              <Terminal className="h-3 w-3" />
              <span className="font-bold">TEST</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
