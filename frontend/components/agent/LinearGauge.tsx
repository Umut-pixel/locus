"use client";

import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export function LinearGauge({
  value,
  totalNotches = 56,
  spacing = 18,
  notchCornerRadius = 2,
  linearHeight = 22,
  activeFill = "var(--chart-1)",
  inactiveFill = "var(--border)",
  inactiveFillOpacity = 0.4,
  className,
}: {
  value: number;
  totalNotches?: number;
  spacing?: number;
  notchCornerRadius?: number;
  linearHeight?: number;
  activeFill?: string;
  inactiveFill?: string;
  inactiveFillOpacity?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, value));
  const filled = Math.round((clamped / 100) * totalNotches);
  const gapRatio = Math.min(Math.max(spacing, 0), 70) / 100;
  const slot = 100 / totalNotches;
  const gap = slot * gapRatio;
  const width = Math.max(slot - gap, 0.4);

  return (
    <svg
      viewBox={`0 0 100 ${linearHeight}`}
      preserveAspectRatio="none"
      className={cn("h-[22px] w-full overflow-visible", className)}
      role="img"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={`Doluluk %${Math.round(clamped)}`}
    >
      {Array.from({ length: totalNotches }, (_, i) => {
        const active = i < filled;
        const x = i * slot + gap / 2;
        const ramp = filled <= 1 ? 1 : 0.55 + (0.45 * i) / (filled - 1);
        return (
          <rect
            key={i}
            x={x}
            y="0"
            width={width}
            height={linearHeight}
            rx={notchCornerRadius}
            fill={active ? activeFill : inactiveFill}
            fillOpacity={active ? ramp : inactiveFillOpacity}
            style={
              reduced
                ? undefined
                : {
                    transition: `fill-opacity 420ms cubic-bezier(0.16,1,0.3,1) ${Math.min(i, 24) * 8}ms`,
                  }
            }
          />
        );
      })}
    </svg>
  );
}
