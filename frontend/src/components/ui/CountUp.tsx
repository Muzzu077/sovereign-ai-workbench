"use client";

import React, { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface CountUpProps {
  to?: number;
  value?: number;
  from?: number;
  duration?: number; // seconds
  decimals?: number;
  prefix?: string;
  suffix?: string;
  separator?: string;
  className?: string;
  autoStart?: boolean;
}

export function CountUp({
  to,
  value,
  from = 0,
  duration = 1.2,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = ",",
  className = "",
  autoStart = true,
}: CountUpProps) {
  const targetVal = value !== undefined ? value : (to ?? 0);
  const [current, setCurrent] = useState(from);
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoStart) return;

    const startVal = from;
    const endVal = targetVal;
    const durMs = duration * 1000;

    const easeOutExpo = (t: number): number => {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    };

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / durMs, 1);
      const easedProgress = easeOutExpo(progress);

      const val = startVal + (endVal - startVal) * easedProgress;
      setCurrent(val);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCurrent(endVal);
      }
    };

    startTimeRef.current = null;
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [to, from, duration, autoStart]);

  const formattedNumber = current
    .toFixed(decimals)
    .replace(/\B(?=(\d{3})+(?!\d))/g, separator);

  return (
    <span className={cn("font-mono tabular-nums tracking-tight", className)}>
      {prefix}
      {formattedNumber}
      {suffix}
    </span>
  );
}

export default CountUp;
