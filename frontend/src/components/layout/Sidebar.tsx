"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquareCode,
  LayoutDashboard,
  FileText,
  Database,
  Bot,
  Cpu,
  ShieldCheck,
  Terminal,
  Layers,
  Activity,
  Server,
  Zap,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getHealth, type HealthResponse } from "@/lib/api";
import { motion } from "framer-motion";
import SovereignStatus from "@/components/sovereign/SovereignStatus";

const NAV_ITEMS = [
  {
    href: "/chat",
    label: "AI Chat Studio",
    description: "Interactive Reasoning & RAG",
    icon: MessageSquareCode,
    color: "from-[#64818E] to-[#4a6272]",
  },
  {
    href: "/",
    label: "Sovereign Core",
    description: "Architecture & Telemetry",
    icon: LayoutDashboard,
    color: "from-[#9CAFBE] to-[#64818E]",
  },
  {
    href: "/documents",
    label: "Documents",
    description: "OCR & Pipeline Ingestion",
    icon: FileText,
    color: "from-[#047857] to-[#1e6b7b]",
  },
  {
    href: "/knowledge",
    label: "Knowledge Base",
    description: "FAISS & Vector Evidence",
    icon: Database,
    color: "from-[#A98688] to-[#8e6f71]",
  },
  {
    href: "/agent",
    label: "Agent Ops",
    description: "Planner & Tool Sandbox",
    icon: Bot,
    color: "from-[#b45309] to-[#9a3412]",
  },
  {
    href: "/models",
    label: "Model Registry",
    description: "Local LLM Management",
    icon: Cpu,
    color: "from-[#be123c] to-[#9f1239]",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await getHealth();
        if (active) setHealth(data);
      } catch {
        // Handled silently
      }
    }
    poll();
    const timer = setInterval(poll, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-[#64818E]/20 bg-white/80 backdrop-blur-3xl shadow-2xl surface-level-1">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-[#64818E]/15 px-5 bg-[#C9D0D8]/30">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#64818E] to-[#4a6272] text-white shadow-[0_0_20px_rgba(100,129,142,0.3)] border border-white/20">
          <ShieldCheck className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9CAFBE] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#64818E]" />
          </span>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-extrabold tracking-tight text-[#192730]">
              SOVEREIGN
            </span>
            <span className="rounded bg-gradient-to-r from-[#64818E]/15 to-[#9CAFBE]/15 border border-[#64818E]/35 px-1.5 py-0.2 font-mono text-[9px] font-bold text-[#1e6b7b] uppercase">
              AI PRO
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-wide text-[#2d404a] font-medium">
            Industrial Workstation
          </span>
        </div>
      </div>

      {/* Navigation Group */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          <div className="px-3 pb-2 text-[10px] font-mono font-bold uppercase tracking-wider text-[#2d404a]">
            Workstation Consoles
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-150 select-none",
                  isActive
                    ? "bg-gradient-to-r from-[#64818E]/15 to-[#9CAFBE]/10 border border-[#64818E]/40 text-[#192730] shadow-[0_0_15px_rgba(100,129,142,0.15)]"
                    : "text-[#2d404a] hover:bg-[#64818E]/10 hover:text-[#192730] border border-transparent"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebarActiveIndicator"
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-gradient-to-b from-[#64818E] to-[#9CAFBE] shadow-[0_0_10px_rgba(100,129,142,0.6)]"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
                    isActive
                      ? "bg-[#64818E]/20 border border-[#64818E]/35 text-[#1e6b7b] shadow-sm"
                      : "bg-[#64818E]/10 text-[#2d404a] group-hover:text-[#192730] group-hover:bg-[#64818E]/20"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="truncate leading-tight font-bold font-sans text-[#192730]">
                    {item.label}
                  </span>
                  <span className="truncate text-[10px] text-[#2d404a] font-mono">
                    {item.description}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Live Subsystem Telemetry Card */}
        <div className="rounded-2xl border border-[#64818E]/20 bg-white/75 p-4 space-y-3 backdrop-blur-xl surface-level-1 shadow-lg">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#192730]">
            <span className="flex items-center gap-1.5 text-[#1e6b7b]">
              <Activity className="h-3.5 w-3.5 text-[#1e6b7b] animate-pulse" />
              Live Telemetry
            </span>
            <span className="flex items-center gap-1.5 text-[#047857] text-[9px] bg-[#047857]/10 border border-[#047857]/25 px-1.5 py-0.5 rounded-full font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#047857] animate-ping" />
              ONLINE
            </span>
          </div>

          <div className="space-y-2 text-[11px] font-mono">
            <div className="flex items-center justify-between text-[#192730]">
              <span className="text-[#2d404a] flex items-center gap-1.5 font-medium">
                <Layers className="h-3 w-3 text-[#1e6b7b]" /> Vectors
              </span>
              <span className="font-bold text-[#1e6b7b]">
                {health ? health.knowledge_chunks : 0} chunks
              </span>
            </div>

            <div className="flex items-center justify-between text-[#192730]">
              <span className="text-[#2d404a] flex items-center gap-1.5 font-medium">
                <Server className="h-3 w-3 text-[#047857]" /> Provider
              </span>
              <span className="truncate max-w-[95px] text-right font-bold text-[#047857]" title={health?.embedding_provider}>
                {health?.embedding_provider || "TF-IDF"}
              </span>
            </div>

            <div className="flex items-center justify-between text-[#192730]">
              <span className="text-[#2d404a] flex items-center gap-1.5 font-medium">
                <Terminal className="h-3 w-3 text-[#1e6b7b]" /> Runtime
              </span>
              <span className="font-bold text-[#192730]">
                v{health?.version || "1.0.0"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Air-Gap Shield */}
      <div className="border-t border-[#64818E]/15 p-3.5 bg-[#C9D0D8]/30">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#047857]/25 bg-[#047857]/8 px-3 py-2 text-xs font-mono shadow-inner">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#047857]/12 text-[#047857] border border-[#047857]/30">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold leading-tight text-[#047857] text-[11px]">
              AIR-GAP HARDENED
            </span>
            <span className="text-[10px] text-[#047857]/70 truncate">
              127.0.0.1 Loopback Only
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
