"use client";

/**
 * Cartesian plot fill — diagonal hatch with edge fade (Background utility).
 * Use instead of grid lines. Coords are viewBox units.
 */
export function ChartPlotBackground({
  id,
  x,
  y,
  width,
  height,
  fadeHorizontal = true,
  fadeVertical = true,
  fadeHorizontalLength = 10,
  fadeVerticalLength = 10,
  opacity = 1,
  className,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fadeHorizontal?: boolean;
  fadeVertical?: boolean;
  fadeHorizontalLength?: number;
  fadeVerticalLength?: number;
  opacity?: number;
  className?: string;
}) {
  if (width <= 0 || height <= 0) return null;

  const pid = `${id}-diag`;
  const fadeX = Math.max(0, Math.min(45, fadeHorizontalLength)) / 100;
  const fadeY = Math.max(0, Math.min(45, fadeVerticalLength)) / 100;
  const edgeW = width * fadeX;
  const edgeH = height * fadeY;

  return (
    <g className={className} pointerEvents="none" aria-hidden>
      <defs>
        <pattern
          id={pid}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2"
            stroke="var(--chart-grid, var(--line))"
            strokeWidth="1"
            fill="none"
          />
        </pattern>
        {fadeHorizontal ? (
          <>
            <linearGradient id={`${id}-fade-l`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--card)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--card)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${id}-fade-r`} x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--card)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--card)" stopOpacity="0" />
            </linearGradient>
          </>
        ) : null}
        {fadeVertical ? (
          <>
            <linearGradient id={`${id}-fade-t`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--card)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--card)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${id}-fade-b`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--card)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--card)" stopOpacity="0" />
            </linearGradient>
          </>
        ) : null}
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={`url(#${pid})`}
        opacity={opacity}
      />
      {fadeHorizontal && edgeW > 0 ? (
        <>
          <rect x={x} y={y} width={edgeW} height={height} fill={`url(#${id}-fade-l)`} />
          <rect
            x={x + width - edgeW}
            y={y}
            width={edgeW}
            height={height}
            fill={`url(#${id}-fade-r)`}
          />
        </>
      ) : null}
      {fadeVertical && edgeH > 0 ? (
        <>
          <rect x={x} y={y} width={width} height={edgeH} fill={`url(#${id}-fade-t)`} />
          <rect
            x={x}
            y={y + height - edgeH}
            width={width}
            height={edgeH}
            fill={`url(#${id}-fade-b)`}
          />
        </>
      ) : null}
    </g>
  );
}
