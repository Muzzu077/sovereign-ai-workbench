"use client";

import React from "react";
import { cn } from "@/lib/utils";
import SovereignStatus from "./SovereignStatus";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, HardDrive, Terminal } from "lucide-react";

export interface DiagnosticItem {
  id: string;
  category: "Loopback" | "Storage" | "Vector" | "Model" | "Security";
  name: string;
  status: "pass" | "warn" | "fail";
  details: string;
  latency_ms?: number;
}

interface SovereignDiagnosticProps {
  items: DiagnosticItem[];
  onRunDiagnostics?: () => void;
  isRunning?: boolean;
  className?: string;
}

export default function SovereignDiagnostic({
  items,
  onRunDiagnostics,
  isRunning,
  className,
}: SovereignDiagnosticProps) {
  const passCount = items.filter((i) => i.status === "pass").length;
  const warnCount = items.filter((i) => i.status === "warn").length;
  const failCount = items.filter((i) => i.status === "fail").length;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[#64818E]/15 bg-white/80 backdrop-blur-xl overflow-hidden font-mono",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border border-[#64818E]/15 bg-[#C9D0D8]/20">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#192730]">
            Air-Gap & Subsystem Diagnostics
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-emerald-400 font-semibold">{passCount} PASS</span>
            {warnCount > 0 && <span className="text-amber-400 font-semibold">{warnCount} WARN</span>}
            {failCount > 0 && <span className="text-rose-400 font-semibold">{failCount} FAIL</span>}
          </div>

          {onRunDiagnostics && (
            <button
              onClick={onRunDiagnostics}
              disabled={isRunning}
              className="flex items-center gap-1.5 rounded-lg border border-[#64818E]/18 bg-[#64818E]/6 px-2.5 py-1 text-xs text-[#2d404a] hover:border-[#64818E]/35 hover:text-[#192730] transition-all cursor-pointer disabled:opacity-50"
            >
              <Terminal className="h-3 w-3" />
              <span>{isRunning ? "RUNNING..." : "EXECUTE AUDIT"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Item List */}
      <div className="divide-y divide-[#64818E]/8">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 text-xs hover:bg-[#64818E]/5 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {item.status === "pass" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : item.status === "warn" ? (
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#2d404a] truncate">{item.name}</span>
                  <span className="rounded bg-[#64818E]/6 border border-[#64818E]/18 px-1.5 py-0.2 text-[9px] uppercase text-[#64818E]/70">
                    {item.category}
                  </span>
                </div>
                <span className="text-[11px] text-[#64818E]/70 font-sans truncate">{item.details}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {item.latency_ms !== undefined && (
                <span className="text-[10px] text-[#64818E]/70">{item.latency_ms}ms</span>
              )}
              <SovereignStatus
                status={item.status === "pass" ? "operational" : item.status === "warn" ? "warning" : "error"}
                size="xs"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
