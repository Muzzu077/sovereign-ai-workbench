"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  variant?: "pills" | "underline";
}

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  className,
  variant = "pills",
}: TabsProps) {
  if (variant === "underline") {
    return (
      <div className={cn("flex space-x-6 border-b border-[#64818E]/20", className)}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 pb-3 pt-1 text-xs font-medium transition-colors select-none cursor-pointer",
                isActive
                  ? "text-[#1e6b7b] font-bold"
                  : "text-[#2d404a] hover:text-[#192730]"
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold",
                    isActive
                      ? "bg-[#1e6b7b]/15 text-[#1e6b7b]"
                      : "bg-[#C9D0D8]/60 text-[#2d404a]"
                  )}
                >
                  {tab.count}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1e6b7b] shadow-[0_0_8px_rgba(30,107,123,0.5)]" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-[#64818E]/25 bg-white/80 p-1 shadow-inner",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all select-none cursor-pointer",
              isActive
                ? "bg-[#64818E]/15 text-[#192730] font-bold shadow-sm border border-[#64818E]/35"
                : "text-[#2d404a] hover:bg-[#64818E]/10 hover:text-[#192730]"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold",
                  isActive
                    ? "bg-[#1e6b7b]/15 text-[#1e6b7b]"
                    : "bg-[#C9D0D8]/60 text-[#2d404a]"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
