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
}) {
  if (width <= 0 || height <= 0) return null;

  const rows = tickFractions(numTicksRows, hideHorizontalEdgeLines);
  const cols = tickFractions(numTicksColumns, hideVerticalEdgeLines);
  const dash = strokeDasharray === "" ? undefined : strokeDasharray;
  const hStroke = fadeHorizontal ? `url(#${id}-grid-h)` : stroke;
  const vStroke = fadeVertical ? `url(#${id}-grid-v)` : stroke;

  return (
    <g pointerEvents="none" aria-hidden>
      <defs>
        {fadeHorizontal ? (
          <linearGradient id={`${id}-grid-h`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="10%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="90%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        ) : null}
        {fadeVertical ? (
          <linearGradient id={`${id}-grid-v`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0" />
            <stop offset="10%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="90%" stopColor={stroke} stopOpacity={strokeOpacity} />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
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
