"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ElementType;
  badge?: string | number;
  disabled?: boolean;
}

interface AnimatedTabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  className?: string;
  tabClassName?: string;
  layoutId?: string;
  size?: "sm" | "md" | "lg";
}

export function AnimatedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
  tabClassName,
  layoutId = "active-tab-pill",
  size = "md",
}: AnimatedTabsProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl bg-[var(--color-wb-bg-inset)] p-1 border border-[var(--color-wb-border)]",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-lg font-medium transition-colors cursor-pointer select-none",
              size === "sm" && "px-2.5 py-1 text-xs",
              size === "md" && "px-3.5 py-1.5 text-xs",
              size === "lg" && "px-4 py-2 text-sm",
              isActive
                ? "text-[var(--color-wb-text)] font-semibold"
                : "text-[var(--color-wb-text-muted)] hover:text-[var(--color-wb-text)]",
              tab.disabled && "opacity-50 cursor-not-allowed",
              tabClassName,
            )}
          >
            {/* Active background pill with spring animation */}
            {isActive && (
              <motion.div
                layoutId={layoutId}
                transition={{
                  type: "spring",
                  stiffness: 450,
                  damping: 35,
                }}
                className="absolute inset-0 rounded-lg bg-[var(--color-wb-surface)] shadow-xs border border-[var(--color-wb-border-strong)]/30"
              />
            )}

            <span className="relative z-10 flex items-center gap-1.5">
              {Icon && (
                <Icon
                  size={size === "sm" ? 13 : 15}
                  className={cn(
                    "transition-colors",
                    isActive
                      ? "text-[var(--color-wb-accent)]"
                      : "text-[var(--color-wb-text-muted)]",
                  )}
                />
              )}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px] font-mono tabular-nums",
                    isActive
                      ? "bg-[var(--color-wb-accent-subtle)] text-[var(--color-wb-accent)] font-semibold"
                      : "bg-[var(--color-wb-border)] text-[var(--color-wb-text-muted)]",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default AnimatedTabs;
