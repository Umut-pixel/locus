"use client";

/**
 * Cartesian reference lines — Grid utility (dashed, optional both axes, edge fade).
 * Coords are viewBox units.
 */
export function ChartGrid({
  id,
  x,
  y,
  width,
  height,
  horizontal = true,
  vertical = false,
  numTicksRows = 5,
  numTicksColumns = 10,
  stroke = "var(--chart-grid, var(--line))",
  strokeOpacity = 1,
  strokeWidth = 1,
  strokeDasharray = "4,4",
  fadeHorizontal = true,
  fadeVertical = false,
  hideHorizontalEdgeLines = false,
  hideVerticalEdgeLines = false,
  highlightYs,
  highlightRowStroke = "var(--chart-foreground-muted, var(--foreground))",
  highlightRowStrokeOpacity = 1,
  highlightRowStrokeWidth = 1,
  highlightRowStrokeDasharray = "0",
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  horizontal?: boolean;
  vertical?: boolean;
  numTicksRows?: number;
  numTicksColumns?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeDasharray?: string;
  fadeHorizontal?: boolean;
  fadeVertical?: boolean;
  hideHorizontalEdgeLines?: boolean;
  hideVerticalEdgeLines?: boolean;
  /** ViewBox y positions to emphasize (e.g. break-even / zero). */
  highlightYs?: number[];
  highlightRowStroke?: string;
  highlightRowStrokeOpacity?: number;
  highlightRowStrokeWidth?: number;
  highlightRowStrokeDasharray?: string;
}) {
  if (width <= 0 || height <= 0) return null;

  const rows = tickFractions(numTicksRows, hideHorizontalEdgeLines);
  const cols = tickFractions(numTicksColumns, hideVerticalEdgeLines);
  const dash = strokeDasharray === "" ? undefined : strokeDasharray;
  const hiDash =
    highlightRowStrokeDasharray === "" || highlightRowStrokeDasharray === "0"
      ? undefined
      : highlightRowStrokeDasharray;
  const hStroke = fadeHorizontal ? `url(#${id}-grid-h)` : stroke;
  const vStroke = fadeVertical ? `url(#${id}-grid-v)` : stroke;
  const hiStroke = fadeHorizontal ? `url(#${id}-grid-hl)` : highlightRowStroke;
  const highlights = highlightYs ?? [];

  return (
    <g pointerEvents="none" aria-hidden>
      <defs>
        {fadeHorizontal ? (
          <linearGradient
            id={`${id}-grid-h`}
            gradientUnits="userSpaceOnUse"
            x1={x}
            y1={0}
            x2={x + width}
            y2={0}
          >
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="10%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="90%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        ) : null}
        {fadeVertical ? (
          <linearGradient
            id={`${id}-grid-v`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={y}
            x2={0}
            y2={y + height}
          >
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="10%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="90%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        ) : null}
        {fadeHorizontal && highlights.length > 0 ? (
          <linearGradient
            id={`${id}-grid-hl`}
            gradientUnits="userSpaceOnUse"
            x1={x}
            y1={0}
            x2={x + width}
            y2={0}
          >
            <stop offset="0%" stopColor={highlightRowStroke} stopOpacity="0" />
            <stop
              offset="10%"
              stopColor={highlightRowStroke}
              stopOpacity={highlightRowStrokeOpacity}
            />
            <stop
              offset="90%"
              stopColor={highlightRowStroke}
              stopOpacity={highlightRowStrokeOpacity}
            />
            <stop offset="100%" stopColor={highlightRowStroke} stopOpacity="0" />
          </linearGradient>
        ) : null}
      </defs>
      {horizontal
        ? rows.map((t) => {
            const yy = y + height * t;
            return (
              <line
                key={`r-${t}`}
                x1={x}
                x2={x + width}
                y1={yy}
                y2={yy}
                stroke={hStroke}
                strokeOpacity={fadeHorizontal ? 1 : strokeOpacity}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                vectorEffect="non-scaling-stroke"
              />
            );
          })
        : null}
      {vertical
        ? cols.map((t) => {
            const xx = x + width * t;
            return (
              <line
                key={`c-${t}`}
                x1={xx}
                x2={xx}
                y1={y}
                y2={y + height}
                stroke={vStroke}
                strokeOpacity={fadeVertical ? 1 : strokeOpacity}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                vectorEffect="non-scaling-stroke"
              />
            );
          })
        : null}
      {highlights.map((yy) => (
        <line
          key={`hl-${yy}`}
          x1={x}
          x2={x + width}
          y1={yy}
          y2={yy}
          stroke={hiStroke}
          strokeOpacity={fadeHorizontal ? 1 : highlightRowStrokeOpacity}
          strokeWidth={highlightRowStrokeWidth}
          strokeDasharray={hiDash}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

function tickFractions(count: number, hideEdges: boolean): number[] {
  const n = Math.max(2, Math.round(count));
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (hideEdges && (i === 0 || i === n - 1)) continue;
    out.push(i / (n - 1));
  }
  return out;
}
