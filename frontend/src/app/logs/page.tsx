"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import AppShell from "@/components/shell/AppShell";
import { listLogs, getLogStats } from "@/lib/api/client";
import type { LogEntry, LogsResponse, LogStats } from "@/lib/api/types";
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
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  BarChart3,
} from "lucide-react";

// ── Category config ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  agent: {
    label: "Agent",
    icon: <Bot size={14} />,
    color: "text-purple-600 bg-purple-50",
  },
  knowledge: {
    label: "Knowledge",
    icon: <BookOpen size={14} />,
    color: "text-blue-600 bg-blue-50",
  },
  workflow: {
    label: "Workflow",
    icon: <Settings size={14} />,
    color: "text-amber-600 bg-amber-50",
  },
  document: {
    label: "Document",
    icon: <FileText size={14} />,
    color: "text-wb-accent bg-wb-accent-subtle",
  },
  execution: {
    label: "Execution",
    icon: <Code2 size={14} />,
    color: "text-green-600 bg-green-50",
  },
  codegen: {
    label: "CodeGen",
    icon: <Code2 size={14} />,
    color: "text-cyan-600 bg-cyan-50",
  },
  export: {
    label: "Export",
    icon: <Download size={14} />,
    color: "text-indigo-600 bg-indigo-50",
  },
  model: {
    label: "Model",
    icon: <Settings size={14} />,
    color: "text-stone-600 bg-stone-50",
  },
  system: {
    label: "System",
    icon: <Shield size={14} />,
    color: "text-stone-500 bg-stone-50",
  },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle2 size={14} className="text-wb-success" />,
  completed: <CheckCircle2 size={14} className="text-wb-success" />,
  failure: <XCircle size={14} className="text-wb-error" />,
  failed: <XCircle size={14} className="text-wb-error" />,
  error: <XCircle size={14} className="text-wb-error" />,
  warning: <AlertTriangle size={14} className="text-wb-warning" />,
};

const PAGE_SIZE = 25;

// ── Page Component ────────────────────────────────────────────────────────

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LogStats | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // ── Fetch data ─────────────────────────────────────────────────────────

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

  // ── Pagination ─────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const goPage = (page: number) => {
    const p = Math.max(1, Math.min(page, totalPages));
    setOffset((p - 1) * PAGE_SIZE);
  };

  // ── Format timestamp ──────────────────────────────────────────────────

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
      <div className="flex flex-col h-full">
        {/* ── Stats bar ─────────────────────────────────────────────── */}
        {stats && stats.total_records > 0 && (
          <div className="flex items-center gap-6 px-5 py-3 border-b border-wb-border bg-wb-surface">
            <div className="flex items-center gap-2 text-sm">
              <BarChart3 size={16} className="text-wb-accent" />
              <span className="font-medium text-wb-text">
                {stats.total_records.toLocaleString()}
              </span>
              <span className="text-wb-text-muted">total events</span>
            </div>

            <div className="w-px h-5 bg-wb-border" />

            {/* Status summary badges */}
            {Object.entries(stats.by_status).map(([status, count]) => (
              <button
                key={status}
                onClick={() => {
                  setStatusFilter(statusFilter === status ? "" : status);
                  setOffset(0);
                }}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors",
                  statusFilter === status
                    ? "bg-wb-accent text-white"
                    : "bg-wb-bg-inset text-wb-text-secondary hover:bg-wb-surface-active"
                )}
              >
                {STATUS_ICON[status] ?? (
                  <Activity size={12} className="text-wb-text-muted" />
                )}
                {status}: {count}
              </button>
            ))}

            <div className="flex-1" />

            {/* Category filters */}
            {Object.entries(stats.by_category).map(([cat, count]) => {
              const meta = CATEGORY_META[cat] ?? CATEGORY_META.system;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setCategoryFilter(categoryFilter === cat ? "" : cat);
                    setOffset(0);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors",
                    categoryFilter === cat
                      ? "bg-wb-accent text-white"
                      : "bg-wb-bg-inset text-wb-text-secondary hover:bg-wb-surface-active"
                  )}
                >
                  {meta.icon}
                  {count}
                </button>
              );
            })}

            <button
              onClick={() => {
                fetchLogs();
                fetchStats();
              }}
              className="p-1.5 text-wb-text-muted hover:text-wb-text transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-wb-text-muted">
              <Loader2 size={24} className="animate-spin mr-2" />
              Loading audit logs...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-wb-text-muted">
              <Activity size={40} className="mb-3 text-wb-text-faint" />
              <p className="text-sm font-medium">No audit logs yet</p>
              <p className="text-xs mt-1">
                Activity will be recorded as you use the workbench.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-wb-surface z-10">
                <tr className="border-b border-wb-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-wb-text-muted uppercase tracking-wide w-[170px]">
                    Time
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-wb-text-muted uppercase tracking-wide w-[100px]">
                    Category
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-wb-text-muted uppercase tracking-wide w-[90px]">
                    Status
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-wb-text-muted uppercase tracking-wide w-[130px]">
                    Model
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-wb-text-muted uppercase tracking-wide">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const meta =
                    CATEGORY_META[entry.category] ?? CATEGORY_META.system;

                  return (
                    <tr
                      key={`${entry.timestamp}-${i}`}
                      className="border-b border-wb-border-subtle hover:bg-wb-surface-hover transition-colors group"
                    >
                      {/* Time */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-wb-text-muted whitespace-nowrap">
                          <Clock size={12} />
                          {formatTime(entry.timestamp)}
                        </div>
                      </td>

                      {/* Category badge */}
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md font-medium",
                            meta.color
                          )}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {STATUS_ICON[entry.execution_status] ?? (
                            <Activity
                              size={14}
                              className="text-wb-text-muted"
                            />
                          )}
                          <span className="text-xs text-wb-text-secondary">
                            {entry.execution_status}
                          </span>
                        </div>
                      </td>

                      {/* Model */}
                      <td className="px-3 py-3">
                        <span className="text-xs text-wb-text-muted font-mono">
                          {entry.selected_model || "—"}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-3 py-3">
                        <span className="text-xs text-wb-text-secondary line-clamp-1">
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
          <div className="flex items-center justify-between px-5 py-3 border-t border-wb-border bg-wb-surface">
            <p className="text-xs text-wb-text-muted">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{" "}
              {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-1.5 rounded text-wb-text-muted hover:text-wb-text disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-wb-text-secondary px-2">
                Page {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded text-wb-text-muted hover:text-wb-text disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
