"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";

export interface SovereignPanelProps extends Omit<HTMLMotionProps<"div">, "title"> {
  title?: React.ReactNode;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "surface" | "inset" | "glass" | "bordered" | "interactive";
  elevation?: 1 | 2 | 3 | 4;
  headerBorder?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function SovereignPanel({
  title,
  subtitle,
  badge,
  action,
  variant = "surface",
  elevation = 2,
  headerBorder = true,
  padding = "md",
  children,
  footer,
  className,
  ...props
}: SovereignPanelProps) {
  const elevationClasses = {
    1: "surface-level-1",
    2: "surface-level-2",
    3: "surface-level-3",
    4: "surface-level-4",
  }[elevation];

  const variantClasses = {
    surface: "border border-[#64818E]/15",
    inset: "border border-[#64818E]/10 shadow-inner",
    glass: "border border-[#64818E]/18 backdrop-blur-2xl",
    bordered: "bg-transparent border border-[#64818E]/22",
    interactive:
      "border border-[#64818E]/15 hover:border-[#64818E]/40 hover:shadow-[0_0_20px_rgba(100,129,142,0.15)] transition-all duration-200 cursor-pointer",
  }[variant];

  const paddingClasses = {
    none: "",
    sm: "p-3 sm:p-4",
    md: "p-4 sm:p-5",
    lg: "p-6 sm:p-7",
  }[padding];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative rounded-2xl overflow-hidden text-[#192730] flex flex-col glass-hover-lift",
        elevationClasses,
        variantClasses,
        className
      )}
      {...props}
    >
      {/* Subtle top reflection line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#64818E]/15 to-transparent" />

      {/* Panel Header */}
      {(title || subtitle || badge || action) && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-5 py-3.5 bg-[#C9D0D8]/20",
            headerBorder && "border-b border-[#64818E]/15"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {title && (
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#192730] truncate flex items-center gap-2">
                {title}
              </div>
            )}
            {badge}
            {subtitle && (
              <span className="text-[11px] text-[#64818E]/70 font-sans hidden sm:inline-block truncate">
                — {subtitle}
              </span>
            )}
          </div>
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
        </div>
      )}

      {/* Body Content */}
      <div className={cn("flex-1", paddingClasses)}>{children}</div>

      {/* Optional Footer */}
      {footer && (
        <div className="border-t border-[#64818E]/12 bg-[#C9D0D8]/15 px-5 py-3 text-xs text-[#64818E]/70 font-mono">
          {footer}
        </div>
      )}
    </motion.div>
  );
}
