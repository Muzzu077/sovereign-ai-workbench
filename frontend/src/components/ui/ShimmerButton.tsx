"use client";

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ShimmerButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: React.ReactNode;
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
}

export function ShimmerButton({
  children,
  shimmerColor = "rgba(255, 255, 255, 0.45)",
  shimmerSize = "0.08em",
  borderRadius = "12px",
  shimmerDuration = "2.5s",
  background,
  className,
  loading = false,
  disabled = false,
  variant = "primary",
  size = "md",
  ...props
}: ShimmerButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      disabled={disabled || loading}
      className={cn(
        "group relative isolate flex items-center justify-center overflow-hidden font-semibold select-none cursor-pointer transition-all shadow-md",
        size === "sm" && "px-3 py-1.5 text-xs gap-1.5",
        size === "md" && "px-4 py-2 text-xs gap-2",
        size === "lg" && "px-5 py-2.5 text-sm gap-2.5",
        isPrimary &&
          "bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-600 hover:from-cyan-400 hover:via-teal-400 hover:to-indigo-500 text-white border border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.25)]",
        variant === "secondary" &&
          "bg-slate-900 text-slate-100 border border-white/10 hover:bg-slate-800 hover:border-cyan-500/30 shadow-xs",
        variant === "outline" &&
          "bg-transparent text-slate-200 border border-white/10 hover:bg-white/[0.06] hover:border-white/20",
        variant === "danger" &&
          "bg-gradient-to-r from-rose-600 to-red-700 text-white hover:opacity-90 border border-rose-500/40 shadow-[0_0_16px_rgba(244,63,94,0.3)]",
        (disabled || loading) && "opacity-50 cursor-not-allowed",
        className,
      )}
      style={{
        borderRadius,
        background: background || undefined,
      }}
      {...props}
    >
      {/* Sliding Shimmer Highlight */}
      {isPrimary && !disabled && !loading && (
        <span
          className="pointer-events-none absolute -inset-full top-0 block bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            animation: `shimmer-slide ${shimmerDuration} infinite`,
          }}
        />
      )}

      {loading ? (
        <Loader2 size={size === "sm" ? 12 : 14} className="animate-spin-smooth" />
      ) : null}

      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.button>
  );
}

export default ShimmerButton;
