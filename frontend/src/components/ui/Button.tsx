"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "cyan"
    | "outline"
    | "danger"
    | "ghost";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export default function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  icon,
  iconRight,
  className,
  ...props
}: ButtonProps) {
  const baseClasses =
    "group relative inline-flex items-center justify-center font-medium transition-all duration-150 select-none cursor-pointer focus-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]";

  const sizeClasses = {
    xs: "px-2.5 py-1 text-xs gap-1.5 rounded-lg",
    sm: "px-3 py-1.5 text-xs gap-2 rounded-xl",
    md: "px-4 py-2 text-xs font-semibold gap-2 rounded-xl",
    lg: "px-5 py-2.5 text-sm font-semibold gap-2.5 rounded-xl",
  }[size];

  const variantClasses = {
    primary:
      "bg-gradient-to-r from-[#64818E] to-[#64818E] hover:from-[#64818E]/90 hover:to-[#64818E]/80 text-[#192730] border border-[#64818E]/40 shadow-lg shadow-[#64818E]/20 hover:shadow-[#64818E]/30",
    secondary:
      "bg-[#C9D0D8]/80 hover:bg-[#C9D0D8]/90 text-[#2d404a] hover:text-[#192730] border border-[#64818E]/60 hover:border-[#64818E]/45 shadow-md backdrop-blur-md",
    cyan:
      "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-[#192730] border border-cyan-400/40 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30",
    outline:
      "bg-transparent hover:bg-[#C9D0D8]/40 text-[#64818E] hover:text-[#192730] border border-[#64818E]/70 hover:border-[#64818E]/50",
    danger:
      "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-500/50 shadow-sm",
    ghost:
      "bg-transparent hover:bg-[#C9D0D8]/40 text-[#64818E]/70 hover:text-[#2d404a] border border-transparent",
  }[variant];

  return (
    <button
      disabled={disabled || loading}
      className={cn(baseClasses, sizeClasses, variantClasses, className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-current" />
      ) : (
        icon && <span className="shrink-0 transition-transform group-hover:scale-105">{icon}</span>
      )}
      {children && <span className="truncate">{children}</span>}
      {!loading && iconRight && (
        <span className="shrink-0 transition-transform group-hover:translate-x-0.5">{iconRight}</span>
      )}
    </button>
  );
}
