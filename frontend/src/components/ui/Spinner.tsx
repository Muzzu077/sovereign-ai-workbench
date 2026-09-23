"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Spinner({
  className = "h-5 w-5",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 justify-center">
      <Loader2 className={cn("animate-spin text-[#1e6b7b]", className)} />
      {label && <span className="text-xs text-[#2d404a] font-medium">{label}</span>}
    </div>
  );
}
