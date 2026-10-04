"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface BackgroundGridProps {
  className?: string;
  pattern?: "dots" | "grid" | "cross";
  variant?: "dots" | "grid" | "cross";
  glow?: boolean;
  opacity?: number;
  mask?: "radial" | "top" | "none";
}

export function BackgroundGrid({
  className,
  pattern,
  variant,
  glow = true,
  opacity,
  mask = "radial",
}: BackgroundGridProps) {
  const activePattern = variant || pattern || "dots";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden -z-10",
        className,
      )}
      aria-hidden="true"
    >
      {/* Pattern layer */}
      <div
        className={cn(
          "absolute inset-0 opacity-[0.4]",
          mask === "radial" &&
            "[mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]",
          mask === "top" &&
            "[mask-image:linear-gradient(to_bottom,#000_30%,transparent_90%)]",
        )}
        style={{
          opacity: opacity !== undefined ? opacity : undefined,
          backgroundImage:
            activePattern === "dots"
              ? `radial-gradient(var(--color-wb-border-strong) 1px, transparent 1px)`
              : activePattern === "grid"
                ? `linear-gradient(to right, var(--color-wb-border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--color-wb-border-subtle) 1px, transparent 1px)`
                : `radial-gradient(var(--color-wb-accent-subtle) 1px, transparent 1px)`,
          backgroundSize:
            activePattern === "grid"
              ? "32px 32px"
              : activePattern === "cross"
                ? "24px 24px"
                : "20px 20px",
        }}
      />

      {/* Ambient glowing radial orbs */}
      {glow && (
        <>
          <div
            className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-[550px] rounded-full opacity-[0.07] blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, var(--color-wb-accent) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute top-1/3 -right-24 h-72 w-72 rounded-full opacity-[0.04] blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, var(--color-wb-info) 0%, transparent 70%)",
            }}
          />
        </>
      )}
    </div>
  );
}

export default BackgroundGrid;
