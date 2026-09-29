"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import { getHealth } from "@/lib/api/client";
import type { HealthResponse } from "@/lib/api/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Database,
  Shield,
  Cpu,
  FileText,
  Network,
  HardDrive,
  Wrench,
  Check,
} from "lucide-react";

function StatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "healthy" || s === "ok" || s === "operational" || s === "active")
    return <CheckCircle2 size={15} className="text-[var(--color-wb-success)]" />;
  if (s === "degraded" || s === "warning")
    return <AlertTriangle size={15} className="text-[var(--color-wb-warning)]" />;
  return <XCircle size={15} className="text-[var(--color-wb-error)]" />;
}

function SubsystemCard({
  title,
  icon: Icon,
  status,
  details,
}: {
  title: string;
  icon: React.ElementType;
  status: string;
  details: Record<string, unknown>;
}) {
  const importantKeys = Object.entries(details).filter(
    ([k]) => k !== "status",
  );

  return (
    <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-4 shadow-sm hover:border-[var(--color-wb-border-strong)] transition-colors">
      <div className="flex items-center justify-between mb-3 border-b border-[var(--color-wb-border-subtle)] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-wb-bg-inset)]">
            <Icon size={14} className="text-[var(--color-wb-accent)]" />
          </div>
          <h3 className="text-xs font-semibold text-[var(--color-wb-text)]">{title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon status={status} />
          <span className="text-[11px] font-medium capitalize text-[var(--color-wb-text-secondary)]">
            {status}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {importantKeys.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-wb-text-muted)] capitalize text-[11px]">
              {key.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-[11px] text-[var(--color-wb-text-secondary)] max-w-[200px] truncate">
              {typeof value === "boolean"
                ? value
                  ? "Active"
                  : "Disabled"
                : typeof value === "object"
                ? Array.isArray(value)
                  ? `${value.length} items`
                  : "Configured"
                : String(value ?? "—")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getHealth();
      setHealth(data);
      setLastChecked(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto px-8 py-8 bg-[var(--color-wb-bg)]">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-[var(--color-wb-text)]">
                System Health & Diagnostics
              </h1>
              <p className="mt-0.5 text-xs text-[var(--color-wb-text-muted)]">
                Status of all local inference subsystems, databases, and memory stores.
                {lastChecked && (
                  <span className="ml-1.5 font-mono">
                    (Updated {formatRelativeTime(lastChecked)})
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-wb-text-secondary)] hover:bg-[var(--color-wb-surface-hover)] transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(loading && "animate-spin-smooth")} />
              <span>Refresh Status</span>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--color-wb-error-bg)] border border-[var(--color-wb-error-border)] p-3.5 text-xs text-[var(--color-wb-error)]">
              <XCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {health && (
            <>
              {/* Overall status banner */}
              <div
                className={cn(
                  "rounded-xl border p-4 shadow-sm transition-all",
                  health.status === "healthy"
                    ? "bg-[var(--color-wb-success-bg)] border-[var(--color-wb-success-border)]"
                    : "bg-[var(--color-wb-warning-bg)] border-[var(--color-wb-warning-border)]",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg shadow-xs",
                        health.status === "healthy"
                          ? "bg-[var(--color-wb-success)] text-white"
                          : "bg-[var(--color-wb-warning)] text-white",
                      )}
                    >
                      <Check size={18} strokeWidth={2.5} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--color-wb-text)]">
                          All Systems {health.status === "healthy" ? "Operational" : "Degraded"}
                        </span>
                        <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-mono font-medium text-[var(--color-wb-text)] border border-black/5">
                          v{health.version}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-wb-text-secondary)]">
                        Local hardware inference is active and responding normally.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: "Models Registered",
                    value: health.models_registered.length,
                    sub: health.models_registered.join(", ") || "None",
                    icon: Cpu,
                  },
                  {
                    label: "Tools Registered",
                    value: health.tools_registered.length,
                    sub: `${health.tools_registered.length} executable tools`,
                    icon: Wrench,
                  },
                  {
                    label: "Knowledge Store",
                    value: health.knowledge_documents,
                    sub: `${health.knowledge_chunks} embedded chunks`,
                    icon: Database,
                  },
                  {
                    label: "Embedding Engine",
                    value: health.embedding_provider || "Local",
                    sub: "Local dense embeddings",
                    icon: HardDrive,
                  },
                ].map((stat) => {
                  const StatIcon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-3.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between text-[10px] uppercase font-semibold tracking-wider text-[var(--color-wb-text-muted)] mb-1">
                        <span>{stat.label}</span>
                        <StatIcon size={12} className="text-[var(--color-wb-accent)]" />
                      </div>
                      <div className="text-lg font-semibold text-[var(--color-wb-text)] font-mono">
                        {stat.value}
                      </div>
                      <div className="text-[10px] text-[var(--color-wb-text-muted)] truncate mt-0.5" title={stat.sub}>
                        {stat.sub}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Subsystems grid */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-wb-text-muted)]">
                  Core Subsystems
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SubsystemCard
                    title="Vector Database"
                    icon={Database}
                    status={health.subsystems.vector_store.status}
                    details={health.subsystems.vector_store}
                  />
                  <SubsystemCard
                    title="Document Storage"
                    icon={HardDrive}
                    status={health.subsystems.document_store.status}
                    details={health.subsystems.document_store}
                  />
                  <SubsystemCard
                    title="Security & Audit Logging"
                    icon={Shield}
                    status={health.subsystems.audit.status}
                    details={health.subsystems.audit}
                  />
                  <SubsystemCard
                    title="Network & Air-Gap Controller"
                    icon={Network}
                    status={health.subsystems.network.status}
                    details={health.subsystems.network}
                  />
                  <SubsystemCard
                    title="Local Embeddings Provider"
                    icon={Cpu}
                    status={health.subsystems.embeddings.status || "operational"}
                    details={health.subsystems.embeddings}
                  />
                </div>
              </div>

              {/* Document Processors section */}
              {health.document_processors.length > 0 && (
                <div className="rounded-xl border border-[var(--color-wb-border)] bg-[var(--color-wb-surface)] p-4 shadow-sm space-y-2">
                  <h3 className="text-xs font-semibold text-[var(--color-wb-text)]">
                    Active Document Ingestion Extractors
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {health.document_processors.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-wb-bg-inset)] border border-[var(--color-wb-border-subtle)] px-2.5 py-1 text-xs font-mono font-medium text-[var(--color-wb-text-secondary)]"
                      >
                        <FileText size={12} className="text-[var(--color-wb-accent)]" />
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {loading && !health && (
            <div className="flex flex-col items-center justify-center py-20 text-xs text-[var(--color-wb-text-muted)] gap-2">
              <Loader2 size={20} className="animate-spin-smooth text-[var(--color-wb-accent)]" />
              <span>Inspecting system subsystems...</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
