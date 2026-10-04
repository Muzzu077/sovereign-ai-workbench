"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ShinyTextProps {
  text: string;
  className?: string;
  shimmerColor?: string;
  speed?: number; // seconds
}

export function ShinyText({
  text,
  className = "",
  shimmerColor = "rgba(255, 255, 255, 0.8)",
  speed = 3,
}: ShinyTextProps) {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent font-medium",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(110deg, var(--color-wb-text) 0%, var(--color-wb-text) 40%, ${shimmerColor} 50%, var(--color-wb-text) 60%, var(--color-wb-text) 100%)`,
        backgroundSize: "200% 100%",
        animation: `shine-sweep ${speed}s ease-in-out infinite`,
      }}
    >
      {text}
    </span>
  );
}

export default ShinyText;
