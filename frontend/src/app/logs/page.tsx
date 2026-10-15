"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import { listLogs, getLogStats } from "@/lib/api/client";
import type { LogEntry, LogStats } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/utils";
import {
  Clipboard,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

function EmptyState({ icon: Icon, title, description }: { icon: typeof Clipboard; title: string; description: string }) {
  return (
    <div className="flex min-h-[310px] flex-col items-center justify-center border border-dashed border-border bg-panel/35 px-6 py-10 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-md border border-border bg-panel text-primary">
        <Icon className="size-5" strokeWidth={1.6} />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listLogs({
        limit,
        offset,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
      });
      setLogs(res.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, offset]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getLogStats();
      setStats(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleNextPage = () => {
    if (stats && offset + limit < stats.total_records) {
      setOffset((prev) => prev + limit);
    }
  };

  const handlePrevPage = () => {
    if (offset > 0) {
      setOffset((prev) => Math.max(0, prev - limit));
    }
  };

  return (
    <AppShell>
      <main className="mx-auto max-w-[1420px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
              <Clipboard className="size-3.5" /> GOVERNANCE / 06
            </div>
            <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl text-foreground">
              Audit logs
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Trace operations without exposing confidential document content.
            </p>
          </div>

          <button
            onClick={() => {
              fetchLogs();
              fetchStats();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-panel text-xs text-muted-foreground hover:text-foreground hover:bg-panel-hover transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Status Line */}
        <div className="mb-7 flex items-center gap-2 border-y border-border py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          IMMUTABLE AUDIT TRAIL
          <span className="mx-2 text-faint">/</span>
          {stats ? `${stats.total_records} TOTAL EVENTS` : "ACTIVE"}
          <span className="mx-2 text-faint">/</span>
          CRYPTO VERIFIABLE
        </div>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-3 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive rounded-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs hover:underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Filters Header (matches reference) */}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">Event history</span>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setOffset(0);
                }}
                className="rounded border border-border bg-panel px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                aria-label="Filter audit events by category"
              >
                <option value="">All categories</option>
                <option value="model">Model inference</option>
                <option value="document">Documents</option>
                <option value="tools">Sandbox / Tools</option>
                <option value="security">Security & Auth</option>
                <option value="knowledge">Knowledge Base</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setOffset(0);
                }}
                className="rounded border border-border bg-panel px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                aria-label="Filter audit events by status"
              >
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[1fr_1fr_1fr] border border-border bg-panel px-5 py-3 font-mono text-[10px] uppercase text-muted-foreground sm:grid-cols-[1.5fr_2fr_1fr_1fr]">
            <span>TIME</span>
            <span>EVENT</span>
            <span className="hidden sm:block">ACTOR / MODEL</span>
            <span>STATUS</span>
          </div>

          {/* Event Rows */}
          {loading ? (
            <div className="flex flex-col items-center justify-center border-x border-b border-border bg-panel/35 py-16 text-xs text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span>Loading audit logs...</span>
            </div>
          ) : logs.length ? (
            <div className="border-x border-b border-border divide-y divide-border bg-panel/30">
              {logs.map((record, idx) => (
                <div
                  key={`${record.timestamp}-${idx}`}
                  className="grid grid-cols-[1fr_1fr_1fr] px-5 py-3.5 text-xs font-mono sm:grid-cols-[1.5fr_2fr_1fr_1fr] items-center hover:bg-panel-hover transition-colors"
                >
                  <span className="text-muted-foreground">
                    {formatRelativeTime(record.timestamp)}
                  </span>
                  <div className="min-w-0 pr-2">
                    <span className="truncate block font-sans font-medium text-foreground text-xs">
                      {record.description || record.task}
                    </span>
                    {record.task && (
                      <span className="text-[10px] text-muted-foreground truncate block font-mono">
                        {record.task}
                      </span>
                    )}
                  </div>
                  <span className="hidden sm:block text-muted-foreground uppercase text-[10px]">
                    {record.selected_model || record.category || "SYSTEM"}
                  </span>
                  <div>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        record.execution_status === "success" || record.execution_status === "completed"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-destructive/10 text-destructive border border-destructive/20"
                      }`}
                    >
                      {record.execution_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Clipboard}
              title="No events to display"
              description="The audit trail will show who did what, when, and the outcome when workbench operations are recorded."
            />
          )}

          {/* Pagination Footer */}
          {stats && stats.total_records > limit && (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span>
                Showing {offset + 1}–{Math.min(offset + limit, stats.total_records)} of {stats.total_records}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                  className="p-1 rounded border border-border bg-panel disabled:opacity-40 hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={offset + limit >= stats.total_records}
                  className="p-1 rounded border border-border bg-panel disabled:opacity-40 hover:text-foreground"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
