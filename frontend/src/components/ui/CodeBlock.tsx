"use client";

import React, { useState } from "react";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { copyToClipboard, cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string | object;
  title?: string;
  language?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  maxHeight?: string;
  className?: string;
}

export default function CodeBlock({
  code,
  title,
  language = "json",
  collapsible = false,
  defaultExpanded = true,
  maxHeight = "max-h-96",
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const formattedCode =
    typeof code === "object" ? JSON.stringify(code, null, 2) : String(code || "");

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(formattedCode);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-[#64818E] bg-white/80 font-mono text-xs shadow-inner",
        className
      )}
    >
      {(title || collapsible || language) && (
        <div
          onClick={() => collapsible && setIsExpanded(!isExpanded)}
          className={cn(
            "flex items-center justify-between border-b border-[#64818E]/80 bg-[#C9D0D8]/80 px-3.5 py-2 select-none",
            collapsible && "cursor-pointer hover:bg-[#C9D0D8]"
          )}
        >
          <div className="flex items-center gap-2">
            {collapsible && (
              <span className="text-[#64818E]/70">
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </span>
            )}
            {title && (
              <span className="font-sans text-xs font-medium text-[#64818E]">
                {title}
              </span>
            )}
            {language && (
              <span className="rounded bg-[#C9D0D8]/80 px-1.5 py-0.5 text-[10px] text-[#64818E]/70">
                {language}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded bg-[#C9D0D8]/60 px-2 py-1 text-[11px] text-[#64818E] transition-colors hover:bg-[#64818E] hover:text-[#192730]"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 text-[#64818E]/70" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}

      {(!collapsible || isExpanded) && (
        <div className={cn("overflow-auto p-3.5 text-[#64818E]", maxHeight)}>
          <pre className="leading-relaxed">
            <code>{formattedCode}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
