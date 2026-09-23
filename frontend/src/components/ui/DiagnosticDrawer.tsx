"use client";

import React from "react";
import {
  X,
  ShieldCheck,
  Server,
  Database,
  Cpu,
  Activity,
  HardDrive,
  Clock,
  Terminal,
  FileCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";

export interface DiagnosticData {
  title: string;
  category: string;
  status: string;
  description?: string;
  attributes: Record<string, string | number | boolean | null | undefined>;
  rawJson?: Record<string, unknown>;
  recentEvents?: Array<{ time: string; event: string; status?: "ok" | "warn" | "error" }>;
}

interface DiagnosticDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: DiagnosticData | null;
}

export default function DiagnosticDrawer({
  isOpen,
  onClose,
  data,
}: DiagnosticDrawerProps) {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-white/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative flex h-full w-full max-w-lg flex-col border-l border-[#64818E]/80 bg-white/95 surface-level-4 shadow-2xl animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#64818E]/25 px-6 py-4 bg-white/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#64818E]/30 bg-[#64818E]/15 text-[#1e6b7b]">
              <Activity className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[#192730] truncate">
                  {data.title}
                </h2>
                <StatusBadge status={data.status} size="xs" />
              </div>
              <span className="text-[11px] font-mono text-[#2d404a] font-semibold">
                DIAGNOSTIC & TELEMETRY INSPECTOR
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#64818E]/30 bg-[#C9D0D8]/40 text-[#2d404a] hover:border-[#64818E]/50 hover:text-[#192730] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {data.description && (
            <p className="text-xs leading-relaxed text-[#192730]">
              {data.description}
            </p>
          )}

          {/* Subsystem Key Attributes Grid */}
          <div className="space-y-2.5">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#2d404a] flex items-center gap-2">
              <HardDrive className="h-3.5 w-3.5 text-[#1e6b7b]" />
              Runtime Telemetry & Attributes
            </h3>
            <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-[#64818E]/25 bg-[#C9D0D8]/30 p-4">
              {Object.entries(data.attributes).map(([key, val]) => (
                <div key={key} className="space-y-0.5">
                  <span className="font-mono text-[10px] uppercase text-[#2d404a] block truncate font-medium">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-xs font-bold text-[#192730] break-all">
                    {val === null || val === undefined
                      ? "N/A"
                      : typeof val === "boolean"
                      ? val
                        ? "TRUE"
                        : "FALSE"
                      : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Diagnostic Activity Log */}
          {data.recentEvents && data.recentEvents.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#2d404a] flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[#1e6b7b]" />
                Recent Diagnostic Events
              </h3>
              <div className="space-y-2 rounded-xl border border-[#64818E]/25 bg-[#C9D0D8]/30 p-4 font-mono text-xs">
                {data.recentEvents.map((evt, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-[#192730]">
                    <span className="text-[10px] text-[#2d404a] shrink-0 mt-0.5 font-medium">
                      {evt.time}
                    </span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {evt.status === "error" ? (
                        <AlertCircle className="h-3 w-3 text-[#be123c] shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-[#047857] shrink-0" />
                      )}
                      <span className="truncate text-xs font-medium">{evt.event}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON Config Inspection */}
          {data.rawJson && (
            <div className="space-y-2.5">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#2d404a] flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 text-[#1e6b7b]" />
                Raw Telemetry Payload
              </h3>
              <pre className="overflow-x-auto rounded-xl border border-[#64818E]/25 bg-white p-3.5 font-mono text-[11px] text-[#192730]">
                {JSON.stringify(data.rawJson, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[#64818E]/20 p-4 bg-white/80 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[10px] text-[#2d404a] font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-[#047857]" />
            <span>Air-Gap Isolated Telemetry</span>
          </div>
          <Button variant="secondary" size="xs" onClick={onClose}>
            Close Inspector
          </Button>
        </div>
      </div>
    </div>
  );
}
