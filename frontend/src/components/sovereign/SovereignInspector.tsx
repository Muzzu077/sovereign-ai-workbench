"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { X, Copy, Check, Terminal, Shield, FileText, Database, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface SovereignInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  data?: Record<string, unknown> | null;
  rawJson?: string;
  children?: React.ReactNode;
}

export default function SovereignInspector({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  data,
  rawJson,
  children,
}: SovereignInspectorProps) {
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = () => {
    const textToCopy = rawJson || (data ? JSON.stringify(data, null, 2) : "");
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#192730]/30 backdrop-blur-sm"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 280 }}
            className="relative z-10 w-full max-w-xl h-full flex flex-col border-l border-[#64818E]/20 bg-white/95 shadow-2xl surface-level-4 backdrop-blur-2xl text-[#192730]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#64818E]/15 bg-[#C9D0D8]/20">
              <div className="flex flex-col min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold tracking-wide uppercase text-[#192730] truncate">
                    {title}
                  </span>
                  {badge}
                </div>
                {subtitle && (
                  <span className="text-xs text-[#64818E]/70 truncate mt-0.5">{subtitle}</span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(data || rawJson) && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-lg border border-[#64818E]/18 bg-[#64818E]/6 px-2.5 py-1.5 text-xs text-[#64818E] hover:border-[#64818E]/35 hover:text-[#192730] transition-all cursor-pointer font-mono"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#047857]" />
                        <span className="text-[#047857]">COPIED</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>COPY JSON</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="rounded-lg border border-[#64818E]/18 bg-[#64818E]/6 p-1.5 text-[#64818E]/60 hover:text-[#192730] hover:bg-[#64818E]/12 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {children}

              {(data || rawJson) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-wider text-[#64818E]/70 flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-[#64818E]" />
                      Payload Inspection
                    </span>
                    <span className="font-mono text-[10px] text-[#64818E]/70">READ-ONLY</span>
                  </div>
                  <pre className="p-4 rounded-xl bg-[#192730]/6 border border-[#64818E]/15 text-xs font-mono text-[#64818E] overflow-x-auto leading-relaxed selection:bg-[#9CAFBE]/30">
                    {rawJson || JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[#64818E]/15 bg-[#C9D0D8]/15 flex items-center justify-between font-mono text-[11px] text-[#64818E]/70">
              <span className="flex items-center gap-1.5 text-[#047857]">
                <Shield className="h-3.5 w-3.5" /> AIR-GAP VERIFIED
              </span>
              <span>ESC TO CLOSE</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
