"use client";

import { useId, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";

import { ChartPlotBackground } from "@/components/agent/ChartPlotBackground";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type IlceBarNokta = {
  ad: string;
  ciro: number;
  borc: number;
  prompt: string;
};

const CIRO_FILL = "var(--ink)";
const BORC_FILL = "var(--ink-3)";
const PAD = { top: 28, right: 6, bottom: 28, left: 6 };
const VB_W = 640;
const VB_H = 200;
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;
const MIN_BAR = 4;
const EASE = "cubic-bezier(0.85, 0, 0.15, 1)";

export function IlceBarChart({
  data,
  loading,
  onAsk,
}: {
  data: IlceBarNokta[];
  loading?: boolean;
  onAsk: (prompt: string) => void;
}) {
  const reduced = useReducedMotion();
  const plotId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const { maxCiro, maxBorc } = useMemo(() => {
    const ciro = data.reduce((m, d) => Math.max(m, d.ciro), 0);
    const borc = data.reduce((m, d) => Math.max(m, d.borc), 0);
    return { maxCiro: ciro > 0 ? ciro : 1, maxBorc: borc > 0 ? borc : 1 };
  }, [data]);

  if (data.length === 0) {
    return <p className="mt-2 text-[12.5px] text-ink-3">İlçesi dolu müşteri yok.</p>;
  }

  const groupW = PLOT_W / data.length;
  const innerGap = groupW * 0.22;
  const barW = (groupW - innerGap * 2 - 5) / 2;
  const active = hover != null ? data[hover] : null;

  return (
    <div className={cn("relative mt-1 min-w-0", loading && "opacity-50")}>
      <div className="mb-1 flex items-center justify-end gap-3">
        <LegendDot color={CIRO_FILL} label="Ciro" />
        <LegendDot color={BORC_FILL} label="Borç" />
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[188px] w-full"
        role="img"
        aria-label="İlçe ciro ve açık bakiye"
        onPointerLeave={() => setHover(null)}
      >
        <ChartPlotBackground
          id={plotId}
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          className={reduced ? undefined : "plot-bg-in"}
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

        {data.map((d, i) => {
          const gx = PAD.left + i * groupW;
          const ciroH = Math.max((d.ciro / maxCiro) * PLOT_H, d.ciro > 0 ? MIN_BAR : 0);
          const borcH = Math.max((d.borc / maxBorc) * PLOT_H, d.borc > 0 ? MIN_BAR : 0);
          const ciroX = gx + innerGap;
          const borcX = ciroX + barW + 5;
          const ciroY = PAD.top + PLOT_H - ciroH;
          const borcY = PAD.top + PLOT_H - borcH;
          const dim = hover != null && hover !== i;
          const lit = hover === i;

          return (
            <g
              key={d.ad}
              role="button"
              tabIndex={0}
              aria-label={`${d.ad}: ciro ${formatCurrency(d.ciro)}, borç ${formatCurrency(d.borc)}`}
              style={{ cursor: "pointer" }}
              onPointerMove={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => onAsk(d.prompt)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAsk(d.prompt);
                }
              }}
              opacity={dim ? 0.35 : 1}
            >
              <rect
                x={gx}
                y={PAD.top}
                width={groupW}
                height={PLOT_H + PAD.bottom}
                fill="transparent"
              />
              <BarCol
                x={ciroX}
                y={ciroY}
                w={barW}
                h={ciroH}
                fill={CIRO_FILL}
                delay={reduced ? 0 : i * 70}
                cap={lit}
              />
              <BarCol
                x={borcX}
                y={borcY}
                w={barW}
                h={borcH}
                fill={BORC_FILL}
                delay={reduced ? 0 : i * 70 + 40}
                cap={lit}
              />
              {lit ? (
                <>
                  <circle
                    cx={ciroX + barW / 2}
                    cy={ciroY}
                    r="3.2"
                    fill={CIRO_FILL}
                    stroke="var(--card)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={borcX + barW / 2}
                    cy={borcY}
                    r="3.2"
                    fill={BORC_FILL}
                    stroke="var(--card)"
                    strokeWidth="1.5"
                  />
                </>
              ) : null}
            </g>
          );
        })}

        {data.map((d, i) => {
          const gx = PAD.left + i * groupW;
          const cx = gx + groupW / 2;
          const lit = hover === i;
          const pillW = Math.min(groupW - 4, Math.max(48, d.ad.length * 7.2));
          const pillX = Math.max(PAD.left, Math.min(VB_W - PAD.right - pillW, cx - pillW / 2));
          return (
            <g key={`lbl-${d.ad}`}>
              {lit ? (
                <rect
                  x={pillX}
                  y={VB_H - 22}
                  width={pillW}
                  height="18"
                  rx="9"
                  fill="var(--ink)"
                />
              ) : null}
              <text
                x={cx}
                y={VB_H - 10}
                textAnchor="middle"
                fill={lit ? "var(--card)" : "var(--ink-3)"}
                fontSize="11"
                fontWeight={lit ? 600 : 500}
              >
                {d.ad}
              </text>
            </g>
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
          <span className="text-[12px] font-medium text-ink">{active.ad}</span>
          <span className="insight-chart-tooltip-item">
            <span className="insight-chart-tooltip-dot" style={{ background: CIRO_FILL }} />
            Ciro {formatCurrency(active.ciro)}
          </span>
          <span className="insight-chart-tooltip-item">
            <span className="insight-chart-tooltip-dot" style={{ background: BORC_FILL }} />
            Borç {formatCurrency(active.borc)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function roundedTopPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

function BarCol({
  x,
  y,
  w,
  h,
  fill,
  delay,
  cap,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  delay: number;
  cap: boolean;
}) {
  const r = Math.min(w / 2, 8);
  return (
    <path
      d={roundedTopPath(x, y, w, h, r)}
      fill={fill}
      className="ilce-bar-grow"
      style={{
        transformBox: "fill-box",
        transformOrigin: "bottom",
        transform: cap ? "scaleY(1.03)" : "scaleY(1)",
        transition: `transform 180ms ${EASE}`,
        animation: delay
          ? `ilce-bar-in 700ms ${EASE} ${delay}ms both`
          : undefined,
      }}
    />
  );
}
