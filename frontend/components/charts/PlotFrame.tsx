"use client";

import { formatAxisTRY } from "./chart-math";

export type PlotBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type XTick = { x: number; label: string };

/**
 * Izgara + eksenler. Kesikli çizgi yok: ızgara düz saç teli, yüzeyden bir ton
 * uzak. Değerler artık sadece tooltip'te değil, sol eksende de okunuyor.
 */
export function PlotFrame({
  plot,
  yTicks,
  yAt,
  xTicks,
  zeroY,
  yFormatter = formatAxisTRY,
  yTickRef,
}: {
  plot: PlotBox;
  yTicks: number[];
  yAt: (value: number) => number;
  xTicks: XTick[];
  /** Sıfır çizgisi — kâr/zarar grafiğinde vurgulu. */
  zeroY?: number;
  yFormatter?: (value: number) => string;
  /** GSAP açılışı ve ölçek geçişleri için satır referansı. */
  yTickRef?: (index: number, el: SVGGElement | null) => void;
}) {
  return (
    <g pointerEvents="none" aria-hidden>
      {yTicks.map((value, i) => {
        const y = yAt(value);
        const isZero = zeroY != null && Math.abs(y - zeroY) < 0.5;
        return (
          <g key={`y-${value}`} className="chart-axis-row" ref={(el) => yTickRef?.(i, el)}>
            <line
              x1={plot.left}
              x2={plot.right}
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
              strokeOpacity={isZero ? 0 : 0.55}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={plot.left - 10}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10.5}
              fontWeight={500}
              fill="var(--muted-foreground)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {yFormatter(value)}
            </text>
          </g>
        );
      })}

      {zeroY != null ? (
        <line
          x1={plot.left}
          x2={plot.right}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--foreground)"
          strokeOpacity={0.32}
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ) : null}

      <line
        x1={plot.left}
        x2={plot.right}
        y1={plot.bottom}
        y2={plot.bottom}
        stroke="var(--chart-grid)"
        strokeOpacity={0.8}
        strokeWidth={1}
        shapeRendering="crispEdges"
      />

      {xTicks.map((tick, i) => (
        <text
          key={`x-${tick.x}-${tick.label}`}
          x={clampLabelX(tick.x, plot, i === 0, i === xTicks.length - 1)}
          y={plot.bottom + 17}
          textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
          fontSize={10.5}
          fontWeight={500}
          fill="var(--muted-foreground)"
        >
          {tick.label}
        </text>
      ))}
    </g>
  );
}

/** Uç etiketler plot kenarını taşmasın — kırpılmış tarih amatör görünüyor. */
function clampLabelX(x: number, plot: PlotBox, first: boolean, last: boolean): number {
  if (first) return Math.max(x, plot.left);
  if (last) return Math.min(x, plot.right);
  return x;
}
