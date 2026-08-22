"use client";

import { useMemo, useState } from "react";

import { CHART_COLORS, InsightChart } from "@/components/agent/InsightChart";
import type { FilterBlock } from "@/lib/agent-blocks";
import { cn } from "@/lib/utils";

function pillClass(value: string): string {
  const v = value.toLowerCase();
  if (/risk|50\+|56\+|borç|borc|gecik/.test(v)) return "filter-status-risk";
  if (/ödendi|odendi|tamam|sağlıklı|saglikli|bakiyesiz|done/.test(v)) return "filter-status-ok";
  if (/izlen|40\+|42-|28-|30\+|bekli|progress/.test(v)) return "filter-status-warn";
  return "filter-status-progress";
}

function parseMoney(raw: string): number {
  const s = raw.replace(/[₺TL\s]/gi, "").trim();
  if (!s || s === "—" || s === "-" || s === "0") return 0;
  const hasComma = s.includes(",");
  const normalized = hasComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\./g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return `₺${Math.round(n).toLocaleString("tr-TR")}`;
}

function moneyColumn(columns: string[], rows: Record<string, string>[]): string | null {
  const named = columns.find((c) => /bakiye|borç|borc|tutar/.test(c.toLowerCase()));
  if (named) return named;
  for (const c of columns) {
    const hits = rows.filter((r) => /₺/.test(r[c] ?? "")).length;
    if (rows.length && hits / rows.length >= 0.4) return c;
  }
  return null;
}

function colAlign(col: string, first: boolean): "name" | "num" | "status" | "text" {
  const n = col.toLowerCase();
  if (first || /müşteri|musteri|unvan|isim|ad\b/.test(n)) return "name";
  if (/durum|risk|band/.test(n)) return "status";
  if (/bakiye|borç|borc|tutar|sevkiyat|gün|gun|kg|adet|₺|%/.test(n)) return "num";
  return "text";
}

function rowBand(row: Record<string, string>, filterKey: string): string {
  return row[filterKey] ?? row.filter ?? "";
}

export function FilterTable({ title, filters, columns, rows, filterKey, chart }: FilterBlock) {
  const [filter, setFilter] = useState(filters[0]?.key ?? "all");
  const moneyCol = useMemo(() => moneyColumn(columns, rows), [columns, rows]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    map.set("all", rows.length);
    for (const f of filters) {
      if (f.key === "all") continue;
      map.set(f.key, rows.filter((r) => rowBand(r, filterKey) === f.key).length);
    }
    return map;
  }, [filters, filterKey, rows]);

  const sums = useMemo(() => {
    const map = new Map<string, number>();
    if (!moneyCol) return map;
    for (const f of filters) {
      if (f.key === "all") continue;
      map.set(
        f.key,
        rows
          .filter((r) => rowBand(r, filterKey) === f.key)
          .reduce((acc, r) => acc + parseMoney(r[moneyCol] ?? ""), 0)
      );
    }
    map.set(
      "all",
      rows.reduce((acc, r) => acc + parseMoney(r[moneyCol] ?? ""), 0)
    );
    return map;
  }, [filters, filterKey, moneyCol, rows]);

  const segments = useMemo(() => {
    return filters
      .filter((f) => f.key !== "all")
      .map((f, i) => ({
        name: f.key,
        label: f.label,
        count: counts.get(f.key) ?? 0,
        color: f.dot ?? CHART_COLORS[i % CHART_COLORS.length],
      }))
      .filter((s) => s.count > 0);
  }, [counts, filters]);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => rowBand(r, filterKey) === filter)),
    [filter, filterKey, rows]
  );

  const active = segments.find((s) => s.name === filter);
  const moneySum = moneyCol ? sums.get(filter) ?? 0 : 0;
  const headlineValue =
    moneyCol && moneySum > 0
      ? formatMoney(moneySum)
      : String(filter === "all" ? rows.length : visible.length);
  const headlineMeta =
    filter === "all"
      ? `${rows.length} kayıt`
      : `${visible.length} · ${active?.label ?? filters.find((f) => f.key === filter)?.label ?? filter}`;

  const trendChart = chart && chart.variant !== "allocation" ? chart : null;
  const showBar = segments.length >= 2;

  const toggle = (key: string) => {
    setFilter((prev) => (prev === key && key !== "all" ? "all" : key));
  };

  return (
    <div className="agent-table-shell my-3 w-full max-w-xl">
      <div className="agent-filter-head">
        {title ? <p className="text-[13px] font-medium text-ink">{title}</p> : null}
        <div className="agent-filter-chips" role="group" aria-label="Kayıt filtresi">
          {filters.map((f) => {
            const activeChip = filter === f.key;
            const count = f.key === "all" ? rows.length : counts.get(f.key) ?? 0;
            const bandIndex = filters.filter((x) => x.key !== "all").findIndex((x) => x.key === f.key);
            const color =
              f.key === "all" ? undefined : f.dot ?? CHART_COLORS[Math.max(0, bandIndex) % CHART_COLORS.length];
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={activeChip}
                onClick={() => toggle(f.key)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-[background-color,box-shadow,color,opacity] duration-200",
                  activeChip ? "bg-field text-ink shadow-btn" : "text-ink-2 hover:bg-hover"
                )}
              >
                {color ? (
                  <span className="size-1.5 rounded-full" style={{ background: color }} />
                ) : null}
                {f.label}
                <span
                  className={cn(
                    "rounded-[4px] px-1 text-[10.5px] tabular-nums",
                    activeChip ? "bg-card text-ink-2" : "text-ink-3"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showBar ? (
        <div className="px-3 pt-1 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink tabular-nums">
              {headlineValue}
            </span>
            <span className="text-[12px] text-ink-2">{headlineMeta}</span>
          </div>
          <div className="mt-2.5 flex h-8 gap-0.5 overflow-hidden rounded-full bg-field p-0.5">
            {segments.map((s) => (
              <button
                key={s.name}
                type="button"
                aria-label={`${s.label}, ${s.count}`}
                aria-pressed={filter === s.name}
                onClick={() => toggle(s.name)}
                className="h-full min-w-1 rounded-full outline-none transition-opacity duration-300 focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  flex: s.count,
                  background: s.color,
                  opacity: filter === "all" || filter === s.name ? 1 : 0.38,
                  transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {trendChart ? <InsightChart block={trendChart} embedded /> : null}

      <div
        aria-label="Filtrelenmiş tablo"
        className="agent-table-scroll agent-filter-body border-t border-line"
        role="region"
        tabIndex={0}
      >
        <table className="agent-table is-split">
          <thead>
            <tr>
              {columns.map((c, j) => {
                const align = colAlign(c, j === 0);
                return (
                  <th
                    key={c}
                    className={cn(align === "name" && "is-name", align === "num" && "is-num")}
                  >
                    {c}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-[12px] text-ink-3">
                  Bu bantta kayıt yok
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr key={i}>
                  {columns.map((c, j) => {
                    const val = row[c] ?? "";
                    const align = colAlign(c, j === 0);
                    const statusLike = align === "status" || /durum|risk|borç|borc|band/.test(c.toLowerCase());
                    return (
                      <td key={c} className={cn(align === "num" && "is-num", align === "name" && "is-name")}>
                        {statusLike && val ? (
                          <span className={pillClass(val)}>{val}</span>
                        ) : (
                          val
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
