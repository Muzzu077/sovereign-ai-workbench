"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, Filter } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
}

interface SovereignDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  onRowClick?: (item: T) => void;
  emptyState?: React.ReactNode;
  headerAction?: React.ReactNode;
  className?: string;
}

export default function SovereignDataTable<T>({
  columns,
  data,
  keyExtractor,
  searchable = true,
  searchPlaceholder = "Filter records...",
  searchKeys,
  onRowClick,
  emptyState,
  headerAction,
  className,
}: SovereignDataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filteredData = data.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (searchKeys && searchKeys.length > 0) {
      return searchKeys.some((k) => String(item[k] ?? "").toLowerCase().includes(q));
    }
    return JSON.stringify(item).toLowerCase().includes(q);
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortKey) return 0;
    const valA = (a as Record<string, unknown>)[sortKey];
    const valB = (b as Record<string, unknown>)[sortKey];
    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    return sortOrder === "asc" ? 1 : -1;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortOrder === "asc") setSortOrder("desc");
      else {
        setSortKey(null);
        setSortOrder("asc");
      }
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  return (
    <div className={cn("flex flex-col rounded-xl border border-[#64818E]/15 bg-white/80 overflow-hidden backdrop-blur-xl", className)}>
      {/* Controls Bar */}
      {(searchable || headerAction) && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-[#64818E]/15 bg-[#C9D0D8]/20">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64818E]/70" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-[#64818E]/18 bg-white/60 pl-9 pr-3 py-1.5 text-xs text-[#2d404a] placeholder:text-[#64818E]/70 focus:outline-none focus:border-[#64818E]/40 font-mono"
              />
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[11px] text-[#64818E]/70">
              {filteredData.length} records
            </span>
            {headerAction}
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-sans text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#64818E]/15 bg-[#64818E]/5 text-[11px] font-mono uppercase tracking-wider text-[#64818E]/70 select-none">
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    style={{ width: col.width }}
                    className={cn(
                      "px-4 py-3 font-semibold",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                      col.sortable && "cursor-pointer hover:text-[#2d404a]"
                    )}
                  >
                    <div className={cn("inline-flex items-center gap-1", col.align === "right" && "justify-end")}>
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-[#64818E]/70">
                          {isSorted ? (
                            sortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 text-[#64818E]" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-[#64818E]" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 text-[#64818E]/70" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#64818E]/8">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-[#64818E]/70">
                  {emptyState || "No records match criteria."}
                </td>
              </tr>
            ) : (
              sortedData.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={() => onRowClick && onRowClick(item)}
                  className={cn(
                    "transition-colors duration-100 hover:bg-[#64818E]/5",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-[#2d404a]",
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                      )}
                    >
                      {col.render
                        ? col.render(item)
                        : String((item as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
