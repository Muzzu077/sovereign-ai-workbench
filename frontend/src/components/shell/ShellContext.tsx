"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getHealth, getModelsHealth } from "@/lib/api/client";
import type { ModelHealthInfo } from "@/lib/api/types";

// ── Sidebar state ─────────────────────────────────────────────────────────
interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
  setCollapsed: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

// ── System status ─────────────────────────────────────────────────────────
interface SystemStatusContextValue {
  backendUp: boolean | null;
  activeModel: string | null;
  modelStatus: string | null;
  modelProvider: string | null;
  refresh: () => void;
}

const SystemStatusContext = createContext<SystemStatusContextValue>({
  backendUp: null,
  activeModel: null,
  modelStatus: null,
  modelProvider: null,
  refresh: () => {},
});

export function useSystemStatus() {
  return useContext(SystemStatusContext);
}

// ── Provider ──────────────────────────────────────────────────────────────
export function ShellProvider({ children }: { children: React.ReactNode }) {
  // Sidebar
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  // System status
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<string | null>(null);
  const [modelProvider, setModelProvider] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      await getHealth();
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    }

    try {
      const models: ModelHealthInfo[] = await getModelsHealth();
      const primary = models.find((m) => m.status === "available") || models[0];
      if (primary) {
        setActiveModel(primary.name);
        setModelStatus(primary.status);
        setModelProvider(primary.provider);
      }
    } catch {
      /* keep previous values */
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed }}>
      <SystemStatusContext.Provider
        value={{ backendUp, activeModel, modelStatus, modelProvider, refresh }}
      >
        {children}
      </SystemStatusContext.Provider>
    </SidebarContext.Provider>
  );
}
