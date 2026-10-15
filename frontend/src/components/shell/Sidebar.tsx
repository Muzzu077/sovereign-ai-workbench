"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Blocks,
  FileText,
  BookOpenText,
  Code2,
  Settings2,
  Activity,
  ScrollText,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar, useSystemStatus } from "./ShellContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_OPERATIONS: NavItem[] = [
  { label: "Workspace", href: "/workspace", icon: Blocks },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Knowledge", href: "/knowledge", icon: BookOpenText },
  { label: "Code sandbox", href: "/code", icon: Code2 },
];

const NAV_CONTROL: NavItem[] = [
  { label: "Models", href: "/models", icon: Settings2 },
  { label: "System health", href: "/health", icon: Activity },
  { label: "Audit logs", href: "/logs", icon: ScrollText },
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
          "nav-item",
          active && "nav-item-active",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon
          className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
        />
        {!collapsed && (
          <span className="truncate">{label}</span>
        )}
        {!collapsed && badge && (
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-primary border border-primary/30 rounded px-1.5 py-0.5">
            {badge}
          </span>
        )}
        {collapsed && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full ml-3 z-50 rounded bg-popover border border-border px-2.5 py-1 text-xs text-popover-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
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
        "bg-sidebar border-r border-border",
        "transition-all duration-200",
      )}
      style={{ width: collapsed ? "76px" : "252px" }}
    >
      {/* ── Brand header ──────────────────────────────────────── */}
      <div
        className={cn(
          "flex h-[76px] items-center justify-between border-b border-border px-5",
          collapsed && "justify-center px-0",
        )}
      >
        <Link href="/workspace" className="flex min-w-0 items-center gap-3">
          <img src="/sovereign-mark.svg" alt="Sovereign" className="size-9 shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-bold leading-tight tracking-[0.12em] text-foreground">
                SOVEREIGN<span className="text-primary">.</span>
              </div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
                AI Workbench
              </div>
            </div>
          )}
        </Link>
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-6">
        {!collapsed && (
          <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            OPERATIONS
          </div>
        )}
        <nav aria-label="Main operations" className="space-y-1">
          {NAV_OPERATIONS.map(renderNavItem)}
        </nav>

        {!collapsed && (
          <div className="mb-3 mt-8 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            CONTROL CENTER
          </div>
        )}
        {collapsed && <div className="h-7" />}
        <nav aria-label="Control center" className="space-y-1">
          {NAV_CONTROL.map(renderNavItem)}
        </nav>
      </div>

      {/* ── Bottom status + collapse ──────────────────────────── */}
      <div className="border-t border-border p-3">
        {!collapsed && (
          <div className="mb-3 rounded-md border border-border bg-panel px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <ShieldCheck className="size-4 text-primary" /> Local-first architecture
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {backendUp
                ? "Connected to local air-gapped runtime with zero egress."
                : "Air-gapped security model. All data and weights remain on-premise."}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                backendUp === null
                  ? "bg-warning"
                  : backendUp
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-destructive",
              )}
            />
            {!collapsed && (
              <span>{backendUp ? "RUNTIME CONNECTED" : "OFFLINE / LOCAL"}</span>
            )}
          </div>
          <button
            onClick={toggle}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeftClose className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
      </div>
    </aside>
  );
}
