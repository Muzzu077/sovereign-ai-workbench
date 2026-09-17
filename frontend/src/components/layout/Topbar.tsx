"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getHealth, type HealthResponse, ApiError } from "@/lib/api";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/documents": "Documents",
  "/knowledge": "Knowledge Base",
  "/agent": "Agent Execution",
  "/models": "Models",
};

export default function Topbar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  const title =
    Object.entries(PAGE_TITLES).find(([path]) =>
      path === "/" ? pathname === "/" : pathname.startsWith(path),
    )?.[1] ?? "Sovereign AI Workbench";

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const h = await getHealth();
        if (!cancelled) {
          setHealth(h);
          setError(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(true);
          if (!(e instanceof ApiError)) console.error("Health poll failed:", e);
        }
      }
    }

    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-primary bg-bg-secondary/80 px-6 backdrop-blur-sm">
      <h1 className="text-base font-semibold text-text-primary">{title}</h1>

      <div className="flex items-center gap-4">
        {/* System Status Indicator */}
        <div className="flex items-center gap-2 rounded-md border border-border-primary bg-bg-tertiary px-3 py-1.5 text-xs">
          <div
            className={`h-2 w-2 rounded-full ${
              error
                ? "bg-accent-red"
                : health
                  ? "bg-accent-green"
                  : "bg-text-muted animate-pulse"
            }`}
          />
          <span className="text-text-secondary">
            {error
              ? "Backend Offline"
              : health
                ? `v${health.version}`
                : "Connecting..."}
          </span>
        </div>

        {/* Embedding provider badge */}
        {health && (
          <div className="hidden items-center gap-1.5 rounded-md bg-bg-tertiary px-2.5 py-1.5 text-xs text-text-muted sm:flex">
            <span className="font-mono">{health.embedding_provider}</span>
          </div>
        )}
      </div>
    </header>
  );
}
