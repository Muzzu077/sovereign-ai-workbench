"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import { listLogs, getLogStats } from "@/lib/api/client";
import type { LogEntry, LogStats } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bot,
  BookOpen,
  FileText,
  Code2,
  Download,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  BarChart3,
  ShieldCheck,
  Search,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BackgroundGrid } from "@/components/ui/BackgroundGrid";
import { CountUp } from "@/components/ui/CountUp";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { StatusBadge } from "@/components/ui/StatusBadge";

// ── Category config ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  agent: {
    label: "Agent",
    icon: <Bot size={13} />,
    color: "text-purple-300 bg-purple-500/15 border-purple-500/30",
  },
  knowledge: {
    label: "Knowledge",
    icon: <BookOpen size={13} />,
    color: "text-blue-300 bg-blue-500/15 border-blue-500/30",
  },
  workflow: {
    label: "Workflow",
    icon: <Settings size={13} />,
    color: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  },
  document: {
    label: "Document",
    icon: <FileText size={13} />,
    color: "text-cyan-300 bg-cyan-500/15 border-cyan-500/30",
  },
  execution: {
    label: "Execution",
    icon: <Code2 size={13} />,
    color: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
  codegen: {
    label: "CodeGen",
    icon: <Code2 size={13} />,
    color: "text-teal-300 bg-teal-500/15 border-teal-500/30",
  },
  export: {
    label: "Export",
    icon: <Download size={13} />,
    color: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30",
  },
  model: {
    label: "Model",
    icon: <Settings size={13} />,
    color: "text-slate-300 bg-slate-500/15 border-slate-500/30",
  },
  system: {
    label: "System",
    icon: <Shield size={13} />,
    color: "text-rose-300 bg-rose-500/15 border-rose-500/30",
  },
};

const PAGE_SIZE = 25;

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LogStats | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLogs({
        limit: PAGE_SIZE,
        offset,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
      });
      setEntries(res.entries);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter, categoryFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await getLogStats();
      setStats(s);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const goPage = (page: number) => {
    const p = Math.max(1, Math.min(page, totalPages));
    setOffset((p - 1) * PAGE_SIZE);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return iso;
    }
  };

  return (
    <AppShell>
      <div className="relative flex flex-col h-full bg-[#070a12]">
        <BackgroundGrid variant="dots" opacity={0.04} />

        {/* ── Top Header & Stats ─────────────────────────────────────── */}
        <div className="relative z-10 p-6 border-b border-white/[0.08] bg-slate-950/70 backdrop-blur-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck size={18} className="text-cyan-400" />
                <span>Audit & Security Ledger</span>
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Cryptographically verifiable event trails for air-gapped compliance.
              </p>
            </div>

            <ShimmerButton
              onClick={() => {
                fetchLogs();
                fetchStats();
              }}
              loading={loading}
              variant="secondary"
              size="sm"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin-smooth")} />
              <span>Refresh Ledger</span>
            </ShimmerButton>
          </div>

          {/* Quick Metrics Bar */}
          {stats && stats.total_records > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <SpotlightCard className="p-3" spotlightColor="rgba(6, 182, 212, 0.12)">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Total Events
                </span>
                <span className="text-lg font-extrabold text-white font-mono">
                  <CountUp value={stats.total_records} duration={0.8} />
                </span>
              </SpotlightCard>

              <SpotlightCard className="p-3" spotlightColor="rgba(16, 185, 129, 0.12)">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Success Records
                </span>
                <span className="text-lg font-extrabold text-emerald-400 font-mono">
                  <CountUp value={stats.by_status["success"] || stats.by_status["completed"] || 0} duration={0.8} />
                </span>
              </SpotlightCard>

              <SpotlightCard className="p-3" spotlightColor="rgba(245, 158, 11, 0.12)">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Active Categories
                </span>
                <span className="text-lg font-extrabold text-white font-mono">
                  {Object.keys(stats.by_category).length}
                </span>
              </SpotlightCard>

              <SpotlightCard className="p-3" spotlightColor="rgba(99, 102, 241, 0.12)">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Storage Mode
                </span>
                <span className="text-xs font-bold text-cyan-400 font-mono mt-1 block">
                  WAL SQLite (Local)
                </span>
              </SpotlightCard>
            </div>
          )}

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Filter:
            </span>

            {/* Status All */}
            <button
              onClick={() => {
                setStatusFilter("");
                setCategoryFilter("");
                setOffset(0);
              }}
              className={cn(
                "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer border",
                !statusFilter && !categoryFilter
                  ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                  : "bg-slate-900/80 text-slate-300 border-white/10 hover:bg-slate-800 hover:border-cyan-500/30",
              )}
            >
              All Events
            </button>

            {/* Category chips */}
            {stats &&
              Object.entries(stats.by_category).map(([cat, count]) => {
                const meta = CATEGORY_META[cat] ?? CATEGORY_META.system;
                const isSelected = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setCategoryFilter(isSelected ? "" : cat);
                      setOffset(0);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 text-xs px-3 py-1 rounded-xl font-medium transition-all cursor-pointer border",
                      isSelected
                        ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                        : "bg-slate-900/80 text-slate-300 border-white/10 hover:bg-slate-800 hover:border-cyan-500/30",
                    )}
                  >
                    {meta.icon}
                    <span>{meta.label}</span>
                    <span className="text-[10px] opacity-75 font-mono">({count})</span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* ── Event Ledger Table ─────────────────────────────────────── */}
        <div className="relative z-10 flex-1 overflow-y-auto">
          {loading && entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
              <Loader2 size={22} className="animate-spin-smooth text-cyan-400" />
              <span className="text-xs">Querying audit trail...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2 text-center p-6">
              <Activity size={36} className="text-slate-600 mb-1" />
              <p className="text-xs font-bold text-white">
                No audit events recorded for current filter
              </p>
              <p className="text-[11px] text-slate-400">
                Actions taken across chat, documents, and code execution will be logged here.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 border-b border-white/[0.08]">
                <tr>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[160px]">
                    Timestamp
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[110px]">
                    Category
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[100px]">
                    Status
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[130px]">
                    Model
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Task / Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {entries.map((entry, i) => {
                  const meta =
                    CATEGORY_META[entry.category] ?? CATEGORY_META.system;

                  return (
                    <tr
                      key={`${entry.timestamp}-${i}`}
                      className="hover:bg-slate-900/60 transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="px-5 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock size={11} className="text-slate-500" />
                          <span>{formatTime(entry.timestamp)}</span>
                        </div>
                      </td>

                      {/* Category badge */}
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded-lg font-bold border",
                            meta.color,
                          )}
                        >
                          {meta.icon}
                          <span>{meta.label}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        {entry.execution_status === "success" || entry.execution_status === "completed" ? (
                          <StatusBadge status="success" label="Success" size="sm" />
                        ) : entry.execution_status === "warning" ? (
                          <StatusBadge status="warning" label="Warning" size="sm" />
                        ) : (
                          <StatusBadge status="error" label="Failed" size="sm" />
                        )}
                      </td>

                      {/* Model */}
                      <td className="px-3 py-3">
                        <span className="font-mono text-[11px] text-slate-300">
                          {entry.selected_model || "—"}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-3 py-3">
                        <span className="text-xs text-slate-300 line-clamp-1 group-hover:text-white font-sans">
                          {entry.description || entry.task}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        {total > PAGE_SIZE && (
          <div className="relative z-10 flex items-center justify-between px-6 py-3 border-t border-white/[0.08] bg-slate-950/80 backdrop-blur-md">
            <p className="text-xs font-mono text-slate-400">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total} events
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="flex items-center justify-center h-7 w-7 rounded-xl border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:border-cyan-500/30 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-mono text-slate-300 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => goPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="flex items-center justify-center h-7 w-7 rounded-xl border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:border-cyan-500/30 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
