"use client";

import React, { useRef, useState, useCallback } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  spotlightSize?: number;
  borderGlow?: boolean;
}

export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(6, 182, 212, 0.16)",
  spotlightSize = 350,
  borderGlow = true,
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setMousePos(null);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "relative rounded-2xl border border-white/[0.08] bg-slate-900/80 p-6",
        "overflow-hidden shadow-md transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]",
        borderGlow && "hover:border-cyan-500/30",
        className,
      )}
      {...props}
    >
      {/* Dynamic Cursor Spotlight Effect */}
      {isHovered && mousePos && (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300"
          style={{
            background: `radial-gradient(${spotlightSize}px circle at ${mousePos.x}px ${mousePos.y}px, ${spotlightColor}, transparent 80%)`,
          }}
        />
      )}

      {/* Subtle Top Inner Highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Card Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
export default SpotlightCard;
