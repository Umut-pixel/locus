"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
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
const FILL = "var(--locus-blue-deep)";
const RISK_FILL = "var(--risk-bad)";

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

function indexFromClientX(clientX: number, rect: DOMRect, count: number) {
  const x = clientX - rect.left;
  const plotLeft = (PAD.left / VB_W) * rect.width;
  const plotW = (PLOT_W / VB_W) * rect.width;
  const t = plotW <= 0 ? 0 : (x - plotLeft) / plotW;
  return Math.max(0, Math.min(count - 1, Math.round(t * (count - 1))));
}

function viewBoxXFromClientX(clientX: number, rect: DOMRect) {
  if (rect.width <= 0) return PAD.left;
  return ((clientX - rect.left) / rect.width) * VB_W;
}

function cubicAt(
  p1: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return {
    x: uu * u * p1.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + tt * t * p2.x,
    y: uu * u * p1.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + tt * t * p2.y,
  };
}

function sampleAlong(
  pts: { x: number; y: number }[],
  x: number
): { x: number; y: number } {
  if (pts.length === 0) return { x: PAD.left, y: PAD.top + PLOT_H };
  if (pts.length === 1) return { x: pts[0]!.x, y: pts[0]!.y };
  const x0 = pts[0]!.x;
  const x1 = pts[pts.length - 1]!.x;
  const cx = Math.max(x0, Math.min(x1, x));
  if (pts.length === 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    const span = b.x - a.x || 1;
    const t = Math.max(0, Math.min(1, (cx - a.x) / span));
    return { x: cx, y: a.y + (b.y - a.y) * t };
  }
  let i = 0;
  for (; i < pts.length - 2; i += 1) {
    if (cx <= pts[i + 1]!.x) break;
  }
  const p0 = pts[Math.max(0, i - 1)]!;
  const p1 = pts[i]!;
  const p2 = pts[i + 1]!;
  const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
  const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
  const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 14; k += 1) {
    const mid = (lo + hi) / 2;
    if (cubicAt(p1, c1, c2, p2, mid).x < cx) lo = mid;
    else hi = mid;
  }
  return cubicAt(p1, c1, c2, p2, (lo + hi) / 2);
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
  const max = useMemo(
    () => Math.max(0, ...data.map((d) => d.tutar)),
    [data]
  );
  if (data.length === 0 || max <= 0) {
    return (
      <p className="mt-2 text-[12.5px] text-ink-3">Açık bakiye bandı yok.</p>
    );
  }
  return (
    <BorcRiskAreaChartPlot
      data={data}
      loading={loading}
      onAsk={onAsk}
      max={max}
    />
  );
}

function BorcRiskAreaChartPlot({
  data,
  loading,
  onAsk,
  max,
}: {
  data: BorcBantNokta[];
  loading?: boolean;
  onAsk: (prompt: string) => void;
  max: number;
}) {
  const rawId = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ruleRef = useRef<SVGGElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);
  const lastHoverRef = useRef(0);
  const tweensRef = useRef<{
    ruleX: ReturnType<typeof gsap.quickTo> | null;
    dotX: ReturnType<typeof gsap.quickTo> | null;
    dotY: ReturnType<typeof gsap.quickTo> | null;
    tipX: ReturnType<typeof gsap.quickTo> | null;
  }>({ ruleX: null, dotX: null, dotY: null, tipX: null });

  const pts = useMemo(() => points(data, max), [data, max]);
  const ptsRef = useRef(pts);
  ptsRef.current = pts;
  const riskStart = data.findIndex((d) => d.riskli);
  if (hover != null) lastHoverRef.current = hover;
  const band = Math.max(
    0,
    Math.min(data.length - 1, hover ?? lastHoverRef.current)
  );
  const active = data[band]!;

  useLayoutEffect(() => {
    const rule = ruleRef.current;
    const dot = dotRef.current;
    const tip = tipRef.current;
    if (!rule || !dot || !tip) return;

    const dur = reduced ? 0 : 0.32;
    const ease = "power3.out";
    const ctx = gsap.context(() => {
      gsap.set(rule, { x: PAD.left, autoAlpha: 0 });
      gsap.set(dot, { x: PAD.left, y: PAD.top + PLOT_H, autoAlpha: 0 });
      gsap.set(tip, { xPercent: -50, x: 0, autoAlpha: 0 });
      tweensRef.current = {
        ruleX: gsap.quickTo(rule, "x", { duration: dur, ease }),
        dotX: gsap.quickTo(dot, "x", { duration: dur, ease }),
        dotY: gsap.quickTo(dot, "y", { duration: dur, ease }),
        tipX: gsap.quickTo(tip, "x", { duration: dur, ease }),
      };
    });

    return () => {
      shownRef.current = false;
      tweensRef.current = { ruleX: null, dotX: null, dotY: null, tipX: null };
      ctx.revert();
    };
  }, [reduced]);

  const line = linePath(pts);
  const area = areaPath(pts);
  const markerX =
    riskStart > 0
      ? PAD.left + ((riskStart - 0.5) / (data.length - 1)) * PLOT_W
      : null;
  const tickEvery = data.length > 8 ? 2 : 1;

  const moveMarker = (p: { x: number; y: number }, immediate: boolean) => {
    const wrapW = wrapRef.current?.offsetWidth ?? 0;
    const cssX = wrapW > 0 ? (p.x / VB_W) * wrapW : 0;
    const { ruleX, dotX, dotY, tipX } = tweensRef.current;
    if (immediate || !ruleX || !dotX || !dotY || !tipX) {
      gsap.set(ruleRef.current, { x: p.x });
      gsap.set(dotRef.current, { x: p.x, y: p.y });
      gsap.set(tipRef.current, { x: cssX });
      return;
    }
    ruleX(p.x);
    dotX(p.x);
    dotY(p.y);
    tipX(cssX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const i = indexFromClientX(e.clientX, rect, data.length);
    setHover(i);
    const p = sampleAlong(ptsRef.current, viewBoxXFromClientX(e.clientX, rect));
    if (!shownRef.current) {
      moveMarker(p, true);
      gsap.to([ruleRef.current, dotRef.current, tipRef.current], {
        autoAlpha: 1,
        duration: reduced ? 0 : 0.18,
        ease: "power2.out",
        overwrite: "auto",
      });
      shownRef.current = true;
      return;
    }
    moveMarker(p, Boolean(reduced));
  };

  const onPointerLeave = () => {
    setHover(null);
    shownRef.current = false;
    gsap.to([ruleRef.current, dotRef.current, tipRef.current], {
      autoAlpha: 0,
      duration: reduced ? 0 : 0.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  return (
    <div
      ref={wrapRef}
      className={cn("relative mt-1 min-w-0", loading && "opacity-50")}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={() => {
        if (hover != null && active) onAsk(active.prompt);
      }}
      style={{ cursor: hover != null ? "pointer" : "crosshair" }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[188px] w-full"
        role="img"
        aria-label="Borç yaşlandırma bantlarına göre açık bakiye"
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

        <g ref={ruleRef} pointerEvents="none">
          <line
            x1={0}
            x2={0}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--line-strong)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <circle
          ref={dotRef}
          className="borc-chart-dot"
          cx={0}
          cy={0}
          r="3.4"
          pointerEvents="none"
          fill={active.riskli ? RISK_FILL : FILL}
          stroke="var(--card)"
          strokeWidth="1.5"
        />

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
              fontSize="10"
              fontWeight={lit ? 600 : 500}
              style={{
                fill: lit ? "var(--ink)" : "var(--ink-3)",
                transition: reduced ? undefined : "fill 0.28s ease",
              }}
            >
              {d.label}
            </text>
          );
        })}
      </svg>

      <div ref={tipRef} className="borc-chart-hover-tip">
        <div className="insight-chart-tooltip">
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
      </div>
    </div>
  );
}
