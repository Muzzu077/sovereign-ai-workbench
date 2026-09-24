"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  FileText,
  BookOpen,
  Activity,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar, useSystemStatus } from "./ShellContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_PRIMARY: NavItem[] = [
  { label: "Workspace", href: "/workspace", icon: MessageSquare },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
];

const NAV_SECONDARY: NavItem[] = [
  { label: "Health", href: "/health", icon: Activity },
  { label: "Models", href: "/models", icon: Cpu },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { backendUp } = useSystemStatus();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const renderNavItem = ({ label, href, icon: Icon }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center rounded-lg wb-interactive",
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
          active
            ? "bg-[var(--color-wb-sidebar-active)] text-[var(--color-wb-text-sidebar-active)]"
            : "text-[var(--color-wb-text-sidebar)] hover:bg-[var(--color-wb-sidebar-hover)] hover:text-[var(--color-wb-text-sidebar-active)]"
        )}
      >
        {/* Active indicator bar */}
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-wb-accent-hover)]" />
        )}

        <Icon
          size={18}
          strokeWidth={1.7}
          className={cn(
            "shrink-0 wb-interactive",
            active ? "" : "group-hover:translate-x-[1px]"
          )}
        />
        {!collapsed && (
          <span className="text-[13px] font-medium tracking-[-0.01em]">
            {label}
          </span>
        )}

        {/* Collapsed tooltip */}
        {collapsed && (
          <span
            role="tooltip"
            className={cn(
              "pointer-events-none absolute left-full ml-2 z-50",
              "rounded-md bg-[var(--color-wb-text)] px-2 py-1",
              "text-[11px] font-medium text-[var(--color-wb-text-inverse)]",
              "opacity-0 group-hover:opacity-100",
              "transition-opacity duration-150",
              "whitespace-nowrap shadow-lg"
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
        "bg-[var(--color-wb-sidebar)] border-r border-[var(--color-wb-sidebar)]",
        "transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out-smooth)]"
      )}
      style={{ width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)" }}
    >
      {/* ── Brand header ──────────────────────────────────────── */}
      <div className={cn(
        "flex items-center gap-2.5 border-b border-white/[0.06]",
        "h-[var(--topbar-height)]",
        collapsed ? "justify-center px-0" : "px-5"
      )}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-wb-accent)] shadow-sm">
          <span className="text-[11px] font-bold text-white tracking-tight">SA</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold tracking-[-0.02em] text-white leading-tight">
              Sovereign AI
            </span>
            <span className="text-[10px] text-[var(--color-wb-text-sidebar)] leading-tight">
              Workbench
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className={cn("flex-1 py-3", collapsed ? "px-2" : "px-3")}>
        <div className="space-y-0.5">
          {NAV_PRIMARY.map(renderNavItem)}
        </div>

        <div className={cn("my-3 border-t border-white/[0.06]", collapsed ? "mx-1" : "mx-0")} />

        {!collapsed && (
          <div className="mb-1.5 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-wb-text-sidebar)]/50">
              System
            </span>
          </div>
        )}
        <div className="space-y-0.5">
          {NAV_SECONDARY.map(renderNavItem)}
        </div>
      </nav>

      {/* ── Bottom status + collapse ──────────────────────────── */}
      <div className={cn(
        "border-t border-white/[0.06]",
        collapsed ? "px-2 py-3" : "px-4 py-3"
      )}>
        {/* Backend status */}
        <div className={cn(
          "flex items-center",
          collapsed ? "justify-center" : "gap-2.5"
        )}>
          <span
            className={cn(
              "inline-block h-[7px] w-[7px] rounded-full shrink-0 ring-2",
              backendUp === null
                ? "bg-amber-400 ring-amber-400/20"
                : backendUp
                ? "bg-emerald-400 ring-emerald-400/20 animate-pulse-dot"
                : "bg-red-400 ring-red-400/20"
            )}
          />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-[var(--color-wb-text-sidebar-active)] leading-tight">
                {backendUp === null
                  ? "Connecting..."
                  : backendUp
                  ? "Connected"
                  : "Offline"}
              </span>
              <span className="text-[10px] text-[var(--color-wb-text-sidebar)] leading-tight">
                {backendUp ? "Local inference" : "Check backend"}
              </span>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={cn(
            "mt-3 flex w-full items-center justify-center rounded-lg py-1.5",
            "text-[var(--color-wb-text-sidebar)] wb-interactive",
            "hover:bg-[var(--color-wb-sidebar-hover)] hover:text-[var(--color-wb-text-sidebar-active)]"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>
    </aside>
  );
}
