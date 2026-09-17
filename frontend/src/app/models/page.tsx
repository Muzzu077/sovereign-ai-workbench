"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listModels,
  getModelsHealth,
  type ModelInfo,
  type ModelHealthInfo,
  ApiError,
} from "@/lib/api";
import Panel from "@/components/ui/Panel";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CapabilityBadge({
  label,
  supported,
}: {
  label: string;
  supported: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
        supported
          ? "bg-accent-green/15 text-accent-green"
          : "bg-text-muted/10 text-text-muted line-through"
      }`}
    >
      {label}
    </span>
  );
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [health, setHealth] = useState<ModelHealthInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [errorModels, setErrorModels] = useState<string | null>(null);
  const [errorHealth, setErrorHealth] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    setErrorModels(null);
    try {
      const data = await listModels();
      setModels(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorModels(`API error ${err.status}: ${err.statusText}`);
      } else {
        setErrorModels(
          err instanceof Error ? err.message : "Failed to fetch models",
        );
      }
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoadingHealth(true);
    setErrorHealth(null);
    try {
      const data = await getModelsHealth();
      setHealth(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorHealth(`API error ${err.status}: ${err.statusText}`);
      } else {
        setErrorHealth(
          err instanceof Error ? err.message : "Failed to fetch model health",
        );
      }
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchHealth();
  }, [fetchModels, fetchHealth]);

  // Build a lookup map for health info by model name
  const healthByName = new Map(health.map((h) => [h.name, h]));

  // -- Loading state ----------------------------------------------------------
  if (loadingModels && loadingHealth) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">Models</h1>
        <p className="text-xs text-text-muted">
          Registered models and their health status
        </p>
      </div>

      {/* ── Models List ─────────────────────────────────────────────── */}
      <Panel
        title="Registered Models"
        subtitle={
          loadingModels
            ? "Loading..."
            : `${models.length} model(s) registered`
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              fetchModels();
              fetchHealth();
            }}
            loading={loadingModels || loadingHealth}
          >
            Refresh
          </Button>
        }
      >
        {/* Error */}
        {errorModels && (
          <div className="mb-4 rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {errorModels}
          </div>
        )}

        {/* Loading */}
        {loadingModels && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {/* Empty */}
        {!loadingModels && !errorModels && models.length === 0 && (
          <EmptyState
            title="No models registered"
            description="No models are currently registered in the system."
          />
        )}

        {/* Model cards */}
        {!loadingModels && models.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map((model) => (
              <div
                key={model.name}
                className="rounded-lg border border-border-secondary bg-bg-tertiary p-4 transition-colors hover:border-border-primary"
              >
                {/* Name + availability */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-mono text-sm font-semibold text-text-primary">
                      {model.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {model.provider}
                    </p>
                  </div>
                  <StatusBadge
                    status={model.is_available ? "available" : "unavailable"}
                    size="sm"
                  />
                </div>

                {/* Capabilities */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <CapabilityBadge
                    label="Text"
                    supported={model.capabilities.supports_text}
                  />
                  <CapabilityBadge
                    label="Vision"
                    supported={model.capabilities.supports_vision}
                  />
                  <CapabilityBadge
                    label="Code"
                    supported={model.capabilities.supports_code}
                  />
                </div>

                {/* Context window */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted">Max context:</span>
                  <span className="font-mono text-accent-amber">
                    {formatTokenCount(model.capabilities.max_context_tokens)}{" "}
                    tokens
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Model Health ────────────────────────────────────────────── */}
      <Panel
        title="Model Health"
        subtitle={
          loadingHealth
            ? "Loading..."
            : `${health.length} model(s) reporting`
        }
      >
        {/* Error */}
        {errorHealth && (
          <div className="mb-4 rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {errorHealth}
          </div>
        )}

        {/* Loading */}
        {loadingHealth && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {/* Empty */}
        {!loadingHealth && !errorHealth && health.length === 0 && (
          <EmptyState
            title="No health data"
            description="No model health information is currently available."
          />
        )}

        {/* Health table */}
        {!loadingHealth && health.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-primary text-xs uppercase tracking-wider text-text-muted">
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium">Provider</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Health Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-secondary">
                {health.map((h) => {
                  const details = Object.entries(h.health_details ?? {});
                  return (
                    <tr key={h.name} className="text-text-secondary">
                      <td className="py-2.5 pr-4 font-mono font-medium text-text-primary">
                        {h.name}
                      </td>
                      <td className="py-2.5 pr-4 text-text-secondary">
                        {h.provider}
                      </td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge
                          status={
                            h.is_available ? "available" : "unavailable"
                          }
                        />
                      </td>
                      <td className="py-2.5">
                        {details.length > 0 ? (
                          <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                            {details.map(([k, v]) => (
                              <span key={k}>
                                <span className="text-text-secondary">
                                  {k.replace(/_/g, " ")}:
                                </span>{" "}
                                <span className="font-mono">
                                  {typeof v === "string"
                                    ? v
                                    : JSON.stringify(v)}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            &mdash;
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
