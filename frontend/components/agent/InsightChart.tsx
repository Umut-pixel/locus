"use client";

import { useMemo, useState } from "react";

import type { ChartBlock, ChartSeries } from "@/lib/agent-blocks";
import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatValue(v: number, unit?: ChartSeries["unit"]): string {
  if (unit === "percent") return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  if (unit === "money") {
    return `₺${Math.round(v).toLocaleString("tr-TR")}`;
  }
  return v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}

function smooth(values: number[], perSegment = 8): number[] {
  if (values.length < 3) return values.slice();
  const out: number[] = [];
  const n = values.length;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = values[Math.max(0, i - 1)]!;
    const p1 = values[i]!;
    const p2 = values[i + 1]!;
    const p3 = values[Math.min(n - 1, i + 2)]!;
    for (let s = 0; s < perSegment; s += 1) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 *
          (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
      );
    }
  }
  out.push(values[n - 1]!);
  return out;
}

function pathFrom(values: number[], w: number, h: number, pad = 16): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartIndexFromPointer(event: React.PointerEvent<HTMLDivElement>, pointCount: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  return Math.round(progress * (pointCount - 1));
}

function LineChart({ series }: { series: ChartSeries[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const dense = useMemo(
    () => series.map((s) => ({ ...s, values: smooth(s.values) })),
    [series]
  );
  const n = dense[0]?.values.length ?? 0;
  const w = 640;
  const h = 166;

  return (
    <div
      className="insight-chart-stage relative h-[166px]"
      onPointerDown={(e) => setHover(chartIndexFromPointer(e, n))}
      onPointerMove={(e) => setHover(chartIndexFromPointer(e, n))}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
        {dense.map((s, i) => (
          <path
            key={s.name}
            d={pathFrom(s.values, w, h)}
            fill="none"
            stroke={s.color ?? COLORS[i % COLORS.length]}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {hover != null && n > 1 ? (
        <>
          <span
            className="insight-chart-cursor"
            style={{ left: `${(hover / (n - 1)) * 100}%` }}
          />
          <span
            className="insight-chart-tooltip-anchor"
            style={{ left: `${Math.min(Math.max((hover / (n - 1)) * 100, 28), 72)}%` }}
          >
            <div className="insight-chart-tooltip">
              {dense.map((s, i) => (
                <span key={s.name} className="insight-chart-tooltip-item">
                  <span
                    className="insight-chart-tooltip-dot"
                    style={{ background: s.color ?? COLORS[i % COLORS.length] }}
                  />
                  {s.name} {formatValue(s.values[hover] ?? 0, s.unit)}
                </span>
              ))}
            </div>
          </span>
        </>
      ) : null}
    </div>
  );
}

function Allocation({ block }: { block: ChartBlock }) {
  const segments = block.segments ?? [];
  const [selected, setSelected] = useState(segments[0]?.name ?? "");
  const active = segments.find((s) => s.name === selected) ?? segments[0];
  if (!active) return null;

  return (
    <div className="min-h-[220px] rounded-[14px] bg-card p-3 shadow-hairline">
      <span className="text-[12px] font-medium text-ink">{block.title ?? "Dağılım"}</span>
      <span className="mt-1 block text-[20px] font-semibold tracking-[-0.01em] text-ink tabular-nums">
        {active.amount ?? `${active.pct}%`}
      </span>
      <div className="mt-3 flex h-9 gap-0.5 overflow-hidden rounded-full bg-field p-0.5">
        {segments.map((s, i) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={selected === s.name}
            onClick={() => setSelected(s.name)}
            className="relative h-full overflow-hidden rounded-full transition-[opacity,transform] duration-300"
            style={{
              width: `${s.pct}%`,
              background: COLORS[i % COLORS.length],
              opacity: selected === s.name ? 1 : 0.55,
              transitionTimingFunction: EASE,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {segments.map((s, i) => (
          <button
            key={s.name}
            type="button"
            onClick={() => setSelected(s.name)}
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] transition-colors",
              selected === s.name ? "bg-field text-ink" : "text-ink-2 hover:bg-hover"
            )}
          >
            <span className="size-1.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            {s.label} <span className="tabular-nums">{s.pct}%</span>
          </button>
        ))}
      </div>
      {block.prose ? (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{block.prose}</p>
      ) : null}
    </div>
  );
}

export function InsightChart({ block }: { block: ChartBlock }) {
  if (block.variant === "allocation" && block.segments?.length) {
    return <div className="my-3 w-full max-w-xl">{Allocation({ block })}</div>;
  }
  const series = (block.series ?? []).filter((s) => s.values.length >= 2);
  if (series.length === 0) return null;

  const latest = series.map((s) => s.values[s.values.length - 1] ?? 0);

  return (
    <div className="my-3 w-full max-w-xl">
      {block.prose ? (
        <p className="mb-2 text-[12.5px] leading-relaxed text-ink-2">{block.prose}</p>
      ) : null}
      <div className="min-h-[220px] rounded-[14px] bg-card p-3 shadow-hairline">
        {block.variant === "compare" && series.length >= 2 ? (
          <div className="mb-2 flex items-start gap-4">
            {series.slice(0, 3).map((s, i) => {
              const v = latest[i] ?? 0;
              const up = v >= (s.values[0] ?? v);
              return (
                <div key={s.name} className="flex-1">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: s.color ?? COLORS[i % COLORS.length] }}
                    />
                    {s.name}
                  </span>
                  <span
                    className={cn(
                      "block text-[17px] font-semibold tracking-[-0.01em] tabular-nums",
                      up ? "text-ink-green" : "text-ink-red"
                    )}
                  >
                    {formatValue(v, s.unit)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink">{block.title ?? series[0]?.name}</span>
            <span className="font-mono text-[12px] text-ink-2 tabular-nums">
              {formatValue(latest[0] ?? 0, series[0]?.unit)}
            </span>
          </div>
        )}
        <div className="overflow-hidden rounded-[8px] bg-inset shadow-hairline">
          <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
            <span className="text-[11px] text-ink-3">Trend</span>
            <span className="rounded-full bg-field px-2 py-0.5 text-[10.5px] font-medium text-ink-2">
              Sorgulanmış veri
            </span>
          </div>
          <LineChart series={series} />
        </div>
      </div>
    </div>
  );
}
