"use client";

import { useId, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";

import { ChartGrid } from "@/components/agent/ChartGrid";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BorcBantNokta = {
  kolon: string;
  label: string;
  tutar: number;
  riskli: boolean;
  prompt: string;
};

const PAD = { top: 22, right: 8, bottom: 28, left: 8 };
const VB_W = 640;
const VB_H = 200;
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;
const FILL = "var(--ink)";
const RISK_FILL = "var(--ink-red)";

function points(data: BorcBantNokta[], max: number) {
  const n = data.length;
  return data.map((d, i) => ({
    x: PAD.left + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W),
    y: PAD.top + PLOT_H - (max <= 0 ? 0 : (d.tutar / max) * PLOT_H),
    ...d,
  }));
}

/** Catmull-Rom through plot points — same family as InsightChart. */
function linePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
  if (pts.length === 2) {
    return `M${pts[0]!.x},${pts[0]!.y} L${pts[1]!.x},${pts[1]!.y}`;
  }
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function areaPath(pts: { x: number; y: number }[]): string {
  const line = linePath(pts);
  if (!line || pts.length === 0) return "";
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const base = PAD.top + PLOT_H;
  return `${line} L${last.x.toFixed(1)},${base} L${first.x.toFixed(1)},${base} Z`;
}

function indexFromPointer(
  event: React.PointerEvent<SVGSVGElement>,
  count: number
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const plotLeft = (PAD.left / VB_W) * rect.width;
  const plotW = (PLOT_W / VB_W) * rect.width;
  const t = plotW <= 0 ? 0 : (x - plotLeft) / plotW;
  return Math.max(0, Math.min(count - 1, Math.round(t * (count - 1))));
}

export function BorcRiskAreaChart({
  data,
  loading,
  onAsk,
}: {
  data: BorcBantNokta[];
  loading?: boolean;
  onAsk: (prompt: string) => void;
}) {
  const rawId = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(0, ...data.map((d) => d.tutar)),
    [data]
  );
  const pts = useMemo(() => points(data, max > 0 ? max : 1), [data, max]);
  const riskStart = data.findIndex((d) => d.riskli);
  const active = hover != null ? data[hover] : null;
  const activePt = hover != null ? pts[hover] : null;

  if (data.length === 0 || max <= 0) {
    return (
      <p className="mt-2 text-[12.5px] text-ink-3">Açık bakiye bandı yok.</p>
    );
  }

  const line = linePath(pts);
  const area = areaPath(pts);
  const markerX =
    riskStart > 0
      ? PAD.left + ((riskStart - 0.5) / (data.length - 1)) * PLOT_W
      : null;
  const tickEvery = data.length > 8 ? 2 : 1;

  return (
    <div className={cn("relative mt-1 min-w-0", loading && "opacity-50")}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[188px] w-full"
        role="img"
        aria-label="Borç yaşlandırma bantlarına göre açık bakiye"
        onPointerMove={(e) => setHover(indexFromPointer(e, data.length))}
        onPointerLeave={() => setHover(null)}
        onClick={() => {
          if (active) onAsk(active.prompt);
        }}
        style={{ cursor: active ? "pointer" : "crosshair" }}
      >
        <defs>
          <linearGradient id={`${rawId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FILL} stopOpacity="0.35" />
            <stop offset="100%" stopColor={FILL} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${rawId}-edge`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="10%" stopColor="white" stopOpacity="1" />
            <stop offset="90%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={`${rawId}-fade`}>
            <rect
              x={PAD.left}
              y={PAD.top}
              width={PLOT_W}
              height={PLOT_H}
              fill={`url(#${rawId}-edge)`}
            />
          </mask>
          <clipPath id={`${rawId}-reveal`}>
            <rect
              className={reduced ? undefined : "area-clip-rect"}
              x={PAD.left}
              y={0}
              width={PLOT_W}
              height={VB_H}
            />
          </clipPath>
        </defs>

        <ChartGrid
          id={rawId}
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          horizontal
          vertical
          numTicksRows={5}
          numTicksColumns={10}
          fadeHorizontal
          hideHorizontalEdgeLines
          hideVerticalEdgeLines
          stroke="var(--chart-grid)"
          strokeOpacity={1}
        />

        <line
          x1={PAD.left}
          x2={VB_W - PAD.right}
          y1={PAD.top + PLOT_H}
          y2={PAD.top + PLOT_H}
          stroke="var(--line-strong)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {markerX != null ? (
          <g>
            <line
              x1={markerX}
              x2={markerX}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--ink-red)"
              strokeOpacity="0.35"
              strokeDasharray="4 4"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={markerX + 4}
              y={PAD.top - 5}
              fill="var(--ink-red)"
              fontSize="10"
              fontWeight="500"
            >
              56g
            </text>
          </g>
        ) : null}

        <g clipPath={`url(#${rawId}-reveal)`}>
          <g mask={`url(#${rawId}-fade)`}>
          <path d={area} fill={`url(#${rawId}-fill)`} />
          <path
            d={line}
            fill="none"
            stroke={FILL}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          </g>
        </g>

        {activePt ? (
          <g>
            <line
              x1={activePt.x}
              x2={activePt.x}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--line-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={activePt.x}
              cy={activePt.y}
              r="3.4"
              fill={active?.riskli ? RISK_FILL : FILL}
              stroke="var(--card)"
              strokeWidth="1.5"
            />
          </g>
        ) : null}

        {data.map((d, i) => {
          if (i % tickEvery !== 0 && i !== data.length - 1) return null;
          const pt = pts[i]!;
          const lit = hover === i;
          return (
            <text
              key={d.kolon}
              x={pt.x}
              y={VB_H - 8}
              textAnchor="middle"
              fill={lit ? "var(--ink)" : "var(--ink-3)"}
              fontSize="10"
              fontWeight={lit ? 600 : 500}
            >
              {d.label}
            </text>
          );
        })}
      </svg>

      {active && hover != null ? (
        <div
          className="insight-chart-tooltip pointer-events-none absolute z-10"
          style={{
            left: `${((hover + 0.5) / data.length) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <span className="text-[12px] font-medium text-ink">{active.label}</span>
          <span className="insight-chart-tooltip-item">
            <span
              className="insight-chart-tooltip-dot"
              style={{ background: active.riskli ? RISK_FILL : FILL }}
            />
            {formatCurrency(active.tutar)}
            {active.riskli ? " · riskli" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}
