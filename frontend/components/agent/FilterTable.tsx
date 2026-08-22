"use client";

import { useMemo, useState } from "react";

import type { FilterBlock } from "@/lib/agent-blocks";
import { cn } from "@/lib/utils";

function pillClass(value: string): string {
  const v = value.toLowerCase();
  if (/risk|50\+|borç|borc|gecik/.test(v)) return "filter-status-risk";
  if (/ödendi|odendi|tamam|sağlıklı|saglikli|done/.test(v)) return "filter-status-ok";
  if (/izlen|40\+|30\+|bekli|progress/.test(v)) return "filter-status-warn";
  return "filter-status-progress";
}

export function FilterTable({ title, filters, columns, rows, filterKey }: FilterBlock) {
  const [filter, setFilter] = useState(filters[0]?.key ?? "all");
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    map.set("all", rows.length);
    for (const f of filters) {
      if (f.key === "all") continue;
      map.set(
        f.key,
        rows.filter((r) => (r[filterKey] ?? r.filter) === f.key).length
      );
    }
    return map;
  }, [filters, filterKey, rows]);

  return (
    <div className="my-3 w-full max-w-xl">
      {title ? <p className="mb-1.5 text-[13px] font-medium text-ink">{title}</p> : null}
      <div
        className="-mx-1 mb-1 flex items-center gap-1 overflow-x-auto px-1 py-1"
        style={{ scrollbarWidth: "none" }}
      >
        {filters.map((f) => {
          const active = filter === f.key;
          const count = f.key === "all" ? rows.length : counts.get(f.key) ?? 0;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-[background-color,box-shadow,color] duration-200",
                active ? "bg-card text-ink shadow-btn" : "text-ink-2 hover:bg-hover"
              )}
            >
              {f.dot ? (
                <span className="size-1.5 rounded-full" style={{ background: f.dot }} />
              ) : null}
              {f.label}
              <span
                className={cn(
                  "rounded-[4px] px-1 text-[10.5px] tabular-nums",
                  active ? "bg-field text-ink-2" : "text-ink-3"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div
        aria-label="Filtrelenmiş tablo"
        className="overflow-x-auto rounded-[14px] bg-card shadow-agent"
        role="region"
        tabIndex={0}
        style={{ scrollbarWidth: "none" }}
      >
        <div className="min-w-[420px]">
          <div
            className="grid border-b border-line px-3 py-2 text-[11.5px] font-medium text-ink-3"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map((c) => (
              <span key={c} className="truncate">
                {c}
              </span>
            ))}
          </div>
          {rows.map((row, i) => {
            const key = row[filterKey] ?? row.filter ?? "";
            const shown = filter === "all" || key === filter;
            return (
              <div
                key={i}
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{
                  gridTemplateRows: shown ? "1fr" : "0fr",
                  opacity: shown ? 1 : 0,
                  transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                }}
              >
                <div className="overflow-hidden">
                  <div
                    className="grid items-center border-b border-line px-3 py-2 text-[12px] last:border-0 hover:bg-hover"
                    style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
                  >
                    {columns.map((c, j) => {
                      const val = row[c] ?? "";
                      const statusLike = /durum|risk|borç|borc|band/.test(c.toLowerCase());
                      return (
                        <span key={c} className={cn("truncate", j === 0 ? "font-medium text-ink" : "text-ink-2")}>
                          {statusLike && val ? (
                            <span className={pillClass(val)}>{val}</span>
                          ) : (
                            val
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
