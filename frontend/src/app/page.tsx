"use client";

import { useEffect, useState, useCallback } from "react";
import { getHealth, type HealthResponse, ApiError } from "@/lib/api";
import MetricCard from "@/components/ui/MetricCard";
import Panel from "@/components/ui/Panel";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";

const POLL_INTERVAL = 15_000;

const SUBSYSTEM_LABELS: Record<string, string> = {
  vector_store: "Vector Store",
  document_store: "Document Store",
  audit: "Audit",
  network: "Network",
  embeddings: "Embeddings",
};

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await getHealth();
      setHealth(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`API error ${err.status}: ${err.statusText}`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to reach backend");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchHealth]);

  // -- Loading state ----------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  // -- Error state ------------------------------------------------------------
  if (error || !health) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-accent-red">{error ?? "Unknown error"}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchHealth();
          }}
          className="rounded-md border border-border-primary bg-bg-secondary px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
        >
          Retry
        </button>
      </div>
    );
  }

  // -- Subsystem rows ---------------------------------------------------------
  const subsystemKeys = Object.keys(SUBSYSTEM_LABELS) as Array<
    keyof typeof SUBSYSTEM_LABELS
  >;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">
          Dashboard
        </h1>
        <p className="text-xs text-text-muted">
          Sovereign AI Workbench &mdash; system overview
        </p>
      </div>

      {/* ── Row 1: Key metrics ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="System Status"
          value={health.status}
          subtitle="Overall health"
          icon={<StatusBadge status={health.status} size="md" />}
        />
        <MetricCard
          label="Knowledge Documents"
          value={health.knowledge_documents}
          subtitle="Ingested documents"
        />
        <MetricCard
          label="Knowledge Chunks"
          value={health.knowledge_chunks}
          subtitle="Indexed chunks"
        />
        <MetricCard
          label="Embedding Provider"
          value={health.embedding_provider}
          subtitle="Active provider"
        />
      </div>

      {/* ── Row 2: Subsystem Health ────────────────────────────────────── */}
      <Panel title="Subsystem Health" subtitle="Status of core subsystems">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-primary text-xs uppercase tracking-wider text-text-muted">
                <th className="pb-2 pr-4 font-medium">Subsystem</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-secondary">
              {subsystemKeys.map((key) => {
                const sub = health.subsystems[key as keyof typeof health.subsystems] ?? {};
                const status =
                  typeof sub.status === "string" ? sub.status : "unknown";
                const details = Object.entries(sub).filter(
                  ([k]) => k !== "status",
                );

                return (
                  <tr key={key} className="text-text-secondary">
                    <td className="py-2.5 pr-4 font-medium text-text-primary">
                      {SUBSYSTEM_LABELS[key]}
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={status} />
                    </td>
                    <td className="py-2.5">
                      {details.length > 0 ? (
                        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                          {details.map(([k, v]) => (
                            <span key={k}>
                              <span className="text-text-secondary">
                                {k.replace(/_/g, " ")}:
                              </span>{" "}
                              {String(v)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">&mdash;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Row 3: System Information ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Registered Models" subtitle={`${health.models_registered.length} model(s)`}>
          {health.models_registered.length === 0 ? (
            <p className="text-xs text-text-muted">No models registered.</p>
          ) : (
            <ul className="space-y-1">
              {health.models_registered.map((m) => (
                <li
                  key={m}
                  className="rounded-md bg-bg-tertiary px-3 py-1.5 text-xs font-mono text-text-secondary"
                >
                  {m}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Registered Tools" subtitle={`${health.tools_registered.length} tool(s)`}>
          {health.tools_registered.length === 0 ? (
            <p className="text-xs text-text-muted">No tools registered.</p>
          ) : (
            <ul className="space-y-1">
              {health.tools_registered.map((t) => (
                <li
                  key={t}
                  className="rounded-md bg-bg-tertiary px-3 py-1.5 text-xs font-mono text-text-secondary"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Document Processors" subtitle={`${health.document_processors.length} processor(s)`}>
          {health.document_processors.length === 0 ? (
            <p className="text-xs text-text-muted">No processors registered.</p>
          ) : (
            <ul className="space-y-1">
              {health.document_processors.map((p) => (
                <li
                  key={p}
                  className="rounded-md bg-bg-tertiary px-3 py-1.5 text-xs font-mono text-text-secondary"
                >
                  {p}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="System Info">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Version</dt>
              <dd className="font-mono text-text-primary">{health.version}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Timestamp</dt>
              <dd className="font-mono text-text-primary">
                {new Date(health.timestamp).toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Status</dt>
              <dd>
                <StatusBadge status={health.status} />
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
