"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Copy, Check, FileText, Sparkles, ExternalLink, ShieldCheck } from "lucide-react";

export interface SovereignEvidenceProps {
  chunkId: string;
  documentName: string;
  content: string;
  score?: number;
  chunkIndex?: number;
  metadata?: Record<string, unknown>;
  onInspect?: () => void;
  className?: string;
}

export default function SovereignEvidence({
  chunkId,
  documentName,
  content,
  score,
  chunkIndex,
  metadata,
  onInspect,
  className,
}: SovereignEvidenceProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const relevancePercentage =
    score !== undefined ? Math.round(Math.min(1, Math.max(0, score)) * 100) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.25 }}
      className={cn(
        "flex flex-col rounded-2xl border border-[#64818E]/18 bg-white/80 p-4.5 transition-all duration-200 hover:border-[#64818E]/40 hover:shadow-[0_0_20px_rgba(100,129,142,0.15)] surface-level-2 backdrop-blur-xl group glass-hover-lift",
        className
      )}
    >
      {/* Header with Document Provenance and Score */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#64818E]/15">
        <div className="flex items-center gap-2.5 min-w-0 font-mono text-xs">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#64818E]/12 border border-[#64818E]/25 text-[#64818E] shrink-0">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <span className="font-bold text-[#192730] group-hover:text-[#64818E] transition-colors truncate">
            {documentName}
          </span>
          {chunkIndex !== undefined && (
            <span className="text-[10px] text-[#64818E]/70 bg-[#64818E]/8 border border-[#64818E]/15 px-1.5 py-0.5 rounded">
              #chunk-{chunkIndex}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {relevancePercentage !== null && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] bg-gradient-to-r from-[#64818E]/15 to-[#9CAFBE]/15 border border-[#64818E]/30 px-2.5 py-1 rounded-full text-[#192730] shadow-sm">
              <Sparkles className="h-3 w-3 text-[#1e6b7b] animate-spin" style={{ animationDuration: "6s" }} />
              <span className="font-bold">{relevancePercentage}% SIMILARITY</span>
            </div>
          )}
          <button
            onClick={handleCopy}
            title="Copy chunk text"
            className="p-1.5 rounded-lg text-[#64818E]/60 hover:text-[#192730] hover:bg-[#64818E]/10 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[#047857]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          {onInspect && (
            <button
              onClick={onInspect}
              title="Inspect metadata & vector embedding"
              className="p-1.5 rounded-lg text-[#64818E]/60 hover:text-[#64818E] hover:bg-[#64818E]/10 transition-colors cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Similarity Score Meter Bar */}
      {relevancePercentage !== null && (
        <div className="my-2.5 h-1.5 w-full bg-[#C9D0D8]/60 rounded-full overflow-hidden border border-[#64818E]/10">
          <div
            className="h-full bg-gradient-to-r from-[#64818E] via-[#9CAFBE] to-[#047857] transition-all duration-500 rounded-full shadow-[0_0_6px_rgba(100,129,142,0.4)]"
            style={{ width: `${relevancePercentage}%` }}
          />
        </div>
      )}

      {/* Grounded Text Content */}
      <div className="py-2 font-sans text-xs text-[#2d404a] leading-relaxed max-h-44 overflow-y-auto whitespace-pre-wrap selection:bg-[#9CAFBE]/30">
        {content}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-2.5 border-t border-[#64818E]/12 font-mono text-[10px] text-[#64818E]/70">
        <span className="truncate">Vector ID: {chunkId}</span>
        <span className="flex items-center gap-1 text-[#047857] font-semibold">
          <ShieldCheck className="h-3.5 w-3.5 text-[#047857]" /> STRICT AIR-GAP PROVENANCE
        </span>
      </div>
    </motion.div>
  );
}
