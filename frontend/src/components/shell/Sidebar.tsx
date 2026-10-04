"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  MessageSquare,
  FileText,
  BookOpen,
  Activity,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
  Code2,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar, useSystemStatus } from "./ShellContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_PRIMARY: NavItem[] = [
  { label: "Workspace", href: "/workspace", icon: MessageSquare },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Code Sandbox", href: "/code", icon: Code2, badge: "NEW" },
];

const NAV_SECONDARY: NavItem[] = [
  { label: "Health & VRAM", href: "/health", icon: Activity },
  { label: "Model Registry", href: "/models", icon: Cpu },
  { label: "Audit Logs", href: "/logs", icon: ScrollText },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { backendUp } = useSystemStatus();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const renderNavItem = ({ label, href, icon: Icon, badge }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center rounded-xl font-medium transition-all select-none",
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
          active
            ? "text-cyan-300"
            : "text-slate-400 hover:text-white hover:bg-white/[0.05]",
        )}
      >
        {/* Animated active glowing pill */}
        {active && (
          <motion.div
            layoutId="sidebar-active-pill"
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 35,
            }}
            className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-950/70 via-slate-900/90 to-indigo-950/50 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
          />
        )}

        {/* Active accent edge bar */}
        {active && (
          <motion.span
            layoutId="sidebar-active-bar"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.8)]"
          />
        )}

        <Icon
          size={18}
          strokeWidth={active ? 2.2 : 1.8}
          className={cn(
            "relative z-10 shrink-0 transition-transform duration-200",
            active ? "text-cyan-400" : "group-hover:scale-110 group-hover:text-cyan-300",
          )}
        />
        {!collapsed && (
          <span className="relative z-10 text-[13px] font-semibold tracking-[-0.01em]">
            {label}
          </span>
        )}

        {!collapsed && badge && (
          <span className="relative z-10 ml-auto px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            {badge}
          </span>
        )}

        {/* Collapsed tooltip */}
        {collapsed && (
          <span
            role="tooltip"
            className={cn(
              "pointer-events-none absolute left-full ml-3 z-50",
              "rounded-xl bg-slate-900 border border-white/10 px-3 py-1.5",
              "text-[11px] font-semibold text-white shadow-2xl",
              "opacity-0 group-hover:opacity-100",
              "transition-opacity duration-150 whitespace-nowrap",
            )}
          >
            {label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col",
        "bg-[var(--color-wb-sidebar)] border-r border-white/[0.08]",
        "transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out-smooth)]",
        "shadow-2xl",
      )}
      style={{ width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)" }}
    >
      {/* ── Brand header ──────────────────────────────────────── */}
      <div
        className={cn(
          "relative flex items-center gap-3 border-b border-white/[0.08] overflow-hidden",
          "h-[var(--topbar-height)]",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        {/* Subtle glowing orb behind brand */}
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 h-20 w-20 rounded-full bg-cyan-500/20 blur-2xl pointer-events-none" />

        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 border border-cyan-300/40 shadow-[0_0_16px_rgba(6,182,212,0.4)]">
          <ShieldCheck size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[13px] font-bold tracking-tight text-white leading-tight flex items-center gap-1.5">
              Sovereign AI
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                AIR-GAP
              </span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium leading-tight">
              Intelligence Workbench
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className={cn("flex-1 py-4", collapsed ? "px-2" : "px-3")}>
        <div className="space-y-1.5">
          {NAV_PRIMARY.map(renderNavItem)}
        </div>

        <div className={cn("my-4 border-t border-white/[0.06]", collapsed ? "mx-1" : "mx-0")} />

        {!collapsed && (
          <div className="mb-2 px-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Telemetry & Control
            </span>
          </div>
        )}
        <div className="space-y-1.5">
          {NAV_SECONDARY.map(renderNavItem)}
        </div>
      </nav>

      {/* ── Bottom status + collapse ──────────────────────────── */}
      <div
        className={cn(
          "border-t border-white/[0.08] bg-slate-950/60",
          collapsed ? "px-2 py-3" : "px-3.5 py-3",
        )}
      >
        {/* Backend status */}
        <div
          className={cn(
            "flex items-center rounded-xl p-2 transition-colors",
            collapsed ? "justify-center" : "gap-2.5 bg-slate-900/60 border border-white/[0.06]",
          )}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            {backendUp && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                backendUp === null
                  ? "bg-amber-400"
                  : backendUp
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]",
              )}
            />
          </span>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-white leading-tight">
                {backendUp === null
                  ? "Connecting..."
                  : backendUp
                  ? "Neural Engine Online"
                  : "Backend Offline"}
              </span>
              <span className="text-[9px] text-slate-400 font-mono leading-tight truncate">
                127.0.0.1:8000
              </span>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={cn(
            "mt-2 flex w-full items-center justify-center rounded-lg py-1.5",
            "text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>
    </aside>
  );
}
