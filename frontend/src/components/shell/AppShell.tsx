"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";
import { ShellProvider, useSidebar } from "./ShellContext";

function ShellLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-full bg-[var(--color-wb-bg)]">
      <Sidebar />
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{
          marginLeft: collapsed
            ? "var(--sidebar-collapsed)"
            : "var(--sidebar-width)",
          transition: `margin-left var(--duration-slow) var(--ease-out-smooth)`,
        }}
      >
        <TopBar />
        <main className="relative flex-1 overflow-hidden">{children}</main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <ShellLayout>{children}</ShellLayout>
    </ShellProvider>
  );
}
