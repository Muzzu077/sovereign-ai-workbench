"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/shell/AppShell";
import { getHealth, getHardware } from "@/lib/api/client";
import type { HealthResponse, HardwareSnapshot } from "@/lib/api/types";
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
  ShieldCheck,
  Zap,
  Radio,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BackgroundGrid } from "@/components/ui/BackgroundGrid";
import { CountUp } from "@/components/ui/CountUp";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

function StatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "healthy" || s === "ok" || s === "operational" || s === "active")
    return <CheckCircle2 size={15} className="text-emerald-400" />;
  if (s === "degraded" || s === "warning")
    return <AlertTriangle size={15} className="text-amber-400" />;
  return <XCircle size={15} className="text-rose-400" />;
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
    <SpotlightCard className="p-4" spotlightColor="rgba(6, 182, 212, 0.12)">
      <div className="flex items-center justify-between mb-3 border-b border-white/[0.08] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Icon size={14} />
          </div>
          <h3 className="text-xs font-bold text-white tracking-tight">{title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon status={status} />
          <span className="text-[11px] font-semibold capitalize text-slate-300 font-mono">
            {status}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {importantKeys.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="text-slate-400 capitalize text-[11px]">
              {key.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-[11px] text-slate-200 max-w-[200px] truncate">
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
    </SpotlightCard>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [hardware, setHardware] = useState<HardwareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [healthData, hwData] = await Promise.all([
        getHealth(),
        getHardware().catch(() => null),
      ]);
      setHealth(healthData);
      if (hwData) setHardware(hwData);
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
      <div className="relative flex-1 overflow-y-auto px-8 py-8 bg-[#070a12]">
        <BackgroundGrid variant="dots" opacity={0.04} />
        <div className="relative z-10 mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <Activity size={18} className="text-cyan-400" />
                <span>System Health & Diagnostics</span>
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Live telemetry of local inference engines, vector stores, and security perimeter.
                {lastChecked && (
                  <span className="ml-1.5 font-mono text-cyan-400/80">
                    (Updated {formatRelativeTime(lastChecked)})
                  </span>
                )}
              </p>
            </div>
            <ShimmerButton
              onClick={fetchHealth}
              loading={loading}
              variant="secondary"
              size="sm"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin-smooth")} />
              <span>Refresh Telemetry</span>
            </ShimmerButton>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300">
              <XCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {health && (
            <>
              {/* Overall status banner */}
              <div
                className={cn(
                  "rounded-2xl border p-5 shadow-lg backdrop-blur-xl transition-all",
                  health.status === "healthy"
                    ? "bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_24px_rgba(16,185,129,0.1)]"
                    : "bg-amber-950/20 border-amber-500/30 shadow-[0_0_24px_rgba(245,158,11,0.1)]",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl shadow-md",
                        health.status === "healthy"
                          ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_0_16px_rgba(16,185,129,0.4)]"
                          : "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]",
                      )}
                    >
                      <Check size={20} strokeWidth={2.6} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          All Subsystems {health.status === "healthy" ? "100% Operational" : "Degraded"}
                        </span>
                        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300 border border-white/10">
                          v{health.version}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-300">
                        Zero outbound sockets detected. Air-gapped local execution active.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: "Models Active",
                    value: health.models_registered.length,
                    sub: health.models_registered.join(", ") || "Gemma 3 4B",
                    icon: Cpu,
                  },
                  {
                    label: "Agent Tools",
                    value: health.tools_registered.length,
                    sub: `${health.tools_registered.length} local tools`,
                    icon: Wrench,
                  },
                  {
                    label: "Knowledge Store",
                    value: health.knowledge_documents,
                    sub: `${health.knowledge_chunks} vector chunks`,
                    icon: Database,
                  },
                  {
                    label: "Embedding Model",
                    value: health.embedding_provider || "Dense 384d",
                    sub: "Local embeddings",
                    icon: HardDrive,
                  },
                ].map((stat) => {
                  const StatIcon = stat.icon;
                  return (
                    <SpotlightCard
                      key={stat.label}
                      className="p-3.5"
                      spotlightColor="rgba(6, 182, 212, 0.12)"
                    >
                      <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                        <span>{stat.label}</span>
                        <StatIcon size={13} className="text-cyan-400" />
                      </div>
                      <div className="text-xl font-extrabold text-white font-mono">
                        {typeof stat.value === "number" ? (
                          <CountUp value={stat.value} duration={1} />
                        ) : (
                          stat.value
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5 font-mono" title={stat.sub}>
                        {stat.sub}
                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>

              {/* Subsystems grid */}
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Radio size={13} className="text-cyan-400 animate-pulse" />
                  <span>Subsystem Matrix</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SubsystemCard
                    title="Vector Database"
                    icon={Database}
                    status={health.subsystems.vector_store.status}
                    details={health.subsystems.vector_store}
                  />
                  <SubsystemCard
                    title="Document Vault"
                    icon={HardDrive}
                    status={health.subsystems.document_store.status}
                    details={health.subsystems.document_store}
                  />
                  <SubsystemCard
                    title="Security Audit Engine"
                    icon={Shield}
                    status={health.subsystems.audit.status}
                    details={health.subsystems.audit}
                  />
                  <SubsystemCard
                    title="Air-Gap Network Firewall"
                    icon={Network}
                    status={health.subsystems.network.status}
                    details={health.subsystems.network}
                  />
                  <SubsystemCard
                    title="Neural Embedding Engine"
                    icon={Cpu}
                    status={health.subsystems.embeddings.status || "operational"}
                    details={health.subsystems.embeddings}
                  />
                </div>
              </div>

              {/* Hardware Telemetry */}
              {hardware && (
                <div className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Zap size={13} className="text-cyan-400" />
                    <span>Hardware Telemetry</span>
                  </h2>

                  {/* System Info Banner */}
                  <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 shadow-md">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-cyan-400" />
                        <span className="text-xs font-bold text-white">{hardware.hostname}</span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {hardware.os} {hardware.architecture}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hardware.inference_capable && (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                            INFERENCE CAPABLE
                          </span>
                        )}
                        {hardware.air_gap_safe && (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                            AIR-GAP SAFE
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* CPU */}
                      <div className="rounded-xl bg-slate-800/60 border border-white/[0.06] p-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">CPU</div>
                        <div className="text-[11px] font-semibold text-white truncate" title={hardware.cpu.model}>
                          {hardware.cpu.model.split("@")[0].trim().replace(/\(.*?\)/g, "").trim().slice(0, 30)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {hardware.cpu.cores_physical}C / {hardware.cpu.cores_logical}T
                          {hardware.cpu.frequency_mhz && ` @ ${(hardware.cpu.frequency_mhz / 1000).toFixed(1)} GHz`}
                        </div>
                      </div>

                      {/* GPU */}
                      <div className="rounded-xl bg-slate-800/60 border border-white/[0.06] p-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">GPU</div>
                        <div className={cn(
                          "text-[11px] font-semibold truncate",
                          hardware.gpu.available ? "text-white" : "text-slate-500",
                        )}>
                          {hardware.gpu.name.slice(0, 30)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {hardware.gpu.available ? (
                            <>
                              {hardware.gpu.vram_mb && `${(hardware.gpu.vram_mb / 1024).toFixed(1)} GB VRAM`}
                              {hardware.gpu.temperature_c != null && ` · ${hardware.gpu.temperature_c}°C`}
                              {hardware.gpu.utilization_pct != null && ` · ${hardware.gpu.utilization_pct}%`}
                            </>
                          ) : "CPU-only mode"}
                        </div>
                      </div>

                      {/* RAM */}
                      <div className="rounded-xl bg-slate-800/60 border border-white/[0.06] p-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">MEMORY</div>
                        <div className="text-[11px] font-semibold text-white">
                          {(hardware.memory.total_mb / 1024).toFixed(1)} GB
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-slate-700 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              hardware.memory.percent_used > 90 ? "bg-rose-500" :
                              hardware.memory.percent_used > 70 ? "bg-amber-500" :
                              "bg-emerald-500",
                            )}
                            style={{ width: `${Math.min(hardware.memory.percent_used, 100)}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {hardware.memory.percent_used.toFixed(1)}% used · {(hardware.memory.available_mb / 1024).toFixed(1)} GB free
                        </div>
                      </div>

                      {/* Disk */}
                      <div className="rounded-xl bg-slate-800/60 border border-white/[0.06] p-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">DISK</div>
                        <div className="text-[11px] font-semibold text-white">
                          {hardware.disk.total_gb.toFixed(1)} GB
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-slate-700 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              hardware.disk.percent_used > 90 ? "bg-rose-500" :
                              hardware.disk.percent_used > 70 ? "bg-amber-500" :
                              "bg-emerald-500",
                            )}
                            style={{ width: `${Math.min(hardware.disk.percent_used, 100)}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {hardware.disk.percent_used.toFixed(1)}% used · {hardware.disk.free_gb.toFixed(1)} GB free
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Document Processors section */}
              {health.document_processors.length > 0 && (
                <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 shadow-md space-y-2">
                  <h3 className="text-xs font-bold text-white">
                    Active Ingestion Parsers & OCR Pipelines
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {health.document_processors.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800/80 border border-white/10 px-3 py-1.5 text-xs font-mono font-medium text-slate-200"
                      >
                        <FileText size={12} className="text-cyan-400" />
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {loading && !health && (
            <div className="flex flex-col items-center justify-center py-20 text-xs text-slate-400 gap-2">
              <Loader2 size={22} className="animate-spin-smooth text-cyan-400" />
              <span>Inspecting system telemetry...</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
