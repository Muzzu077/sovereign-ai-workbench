"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CircularProgressProps {
  value: number; // 0 to 100
  size?: number; // px
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string; // hex or css var
  trackColor?: string;
  showValue?: boolean;
  className?: string;
}

export function CircularProgress({
  value,
  size = 110,
  strokeWidth = 9,
  label,
  sublabel,
  color = "var(--color-wb-accent)",
  trackColor = "var(--color-wb-border)",
  showValue = true,
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(100, Math.max(0, value));
  const offset = circumference - (clampedValue / 100) * circumference;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center inline-flex",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90 transform"
        style={{ overflow: "visible" }}
      >
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          className="opacity-40"
        />

        {/* Animated Progress Circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{
            filter: "drop-shadow(0 0 3px rgba(15, 118, 110, 0.25))",
          }}
        />
      </svg>

      {/* Center Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
        {showValue && (
          <span className="text-base font-bold font-mono tracking-tight text-[var(--color-wb-text)]">
            {Math.round(clampedValue)}%
          </span>
        )}
        {label && (
          <span className="text-[10px] font-medium text-[var(--color-wb-text-muted)] -mt-0.5">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="text-[9px] text-[var(--color-wb-text-faint)]">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

export default CircularProgress;
