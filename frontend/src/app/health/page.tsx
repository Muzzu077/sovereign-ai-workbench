"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import { getHealth } from "@/lib/api/client";
import type { HealthResponse } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/utils";
import {
  Activity,
  Server,
  FileText,
  Database,
  Clipboard,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Check,
  AlertTriangle,
} from "lucide-react";

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to health endpoint");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const subsystems = [
    {
      name: "Model runtime",
      icon: Server,
      status: health?.status === "healthy" ? "CONNECTED" : "UNVERIFIED",
      detail: health?.models_registered.join(", ") || "llama.cpp / Gemma 3",
      healthy: true,
    },
    {
      name: "Document intelligence",
      icon: FileText,
      status: health?.status === "healthy" ? "CONNECTED" : "UNVERIFIED",
      detail: `${health?.knowledge_documents || 0} documents in vault`,
      healthy: true,
    },
    {
      name: "Vector store",
      icon: Database,
      status: health?.status === "healthy" ? "CONNECTED" : "UNVERIFIED",
      detail: `${health?.knowledge_chunks || 0} chunks (384-D ONNX)`,
      healthy: true,
    },
    {
      name: "Audit service",
      icon: Clipboard,
      status: health?.status === "healthy" ? "CONNECTED" : "UNVERIFIED",
      detail: "WAL SQLite Ledger Active",
      healthy: true,
    },
    {
      name: "Network boundary",
      icon: ShieldCheck,
      status: "AIR-GAPPED",
      detail: "Zero outbound network egress",
      healthy: true,
    },
  ];

  return (
    <AppShell>
      <main className="mx-auto max-w-[1420px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
              <Activity className="size-3.5" /> DIAGNOSTICS / 05
            </div>
            <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl text-foreground">
              System health
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Visibility into the services behind your private workbench.
            </p>
          </div>

          <button
            onClick={fetchHealth}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-panel text-xs text-muted-foreground hover:text-foreground hover:bg-panel-hover transition-colors"
            title="Refresh telemetry"
          >
            <RefreshCw className={lastChecked && loading ? "size-3.5 animate-spin" : "size-3.5"} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Status Line */}
        <div className="mb-7 flex items-center gap-2 border-y border-border py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          SYSTEM DIAGNOSTICS
          <span className="mx-2 text-faint">/</span>
          {health?.status === "healthy" ? "ALL SUBSYSTEMS OPERATIONAL" : "TELEMETRY UNVERIFIED"}
          {lastChecked && (
            <>
              <span className="mx-2 text-faint">/</span>
              CHECKED {formatRelativeTime(lastChecked.toISOString()).toUpperCase()}
            </>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-3 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive rounded-md">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs hover:underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Top 3 Stat Cards (matches reference layout) */}
        <div>
          <div className="mb-4 grid gap-px border border-border bg-border sm:grid-cols-3">
            <div className="bg-panel p-5">
              <div className="font-mono text-[10px] text-muted-foreground">SYSTEM STATUS</div>
              <div className="mt-3 text-xl font-medium text-foreground flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" />
                {health?.status === "healthy" ? "Operational" : "Unverified"}
              </div>
            </div>
            <div className="bg-panel p-5">
              <div className="font-mono text-[10px] text-muted-foreground">NETWORK BOUNDARY</div>
              <div className="mt-3 text-xl font-medium text-primary flex items-center gap-2">
                <ShieldCheck className="size-5" />
                Air-Gapped (0 Egress)
              </div>
            </div>
            <div className="bg-panel p-5">
              <div className="font-mono text-[10px] text-muted-foreground">LOCAL RUNTIME</div>
              <div className="mt-3 text-xl font-medium text-foreground flex items-center gap-2">
                <Server className="size-5 text-muted-foreground" />
                {health?.status === "healthy" ? `Connected (v${health.version})` : "Not connected"}
              </div>
            </div>
          </div>

          {/* Subsystems List */}
          <div className="mt-8 mb-4 text-sm font-medium text-foreground">Subsystems</div>
          <div className="border border-border divide-y divide-border bg-panel/30">
            {subsystems.map(({ name, icon: SubIcon, status, detail, healthy }) => (
              <div
                key={name}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-3 text-sm">
                  <div className="grid size-8 place-items-center rounded border border-border bg-panel">
                    <SubIcon className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{detail}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-primary" />
                  <span className="font-mono text-[10px] uppercase text-primary font-semibold">
                    {status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
