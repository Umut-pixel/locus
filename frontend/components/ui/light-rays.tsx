"use client";

import { useMemo, useEffect, useState, type CSSProperties, type HTMLAttributes } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

interface LightRaysProps extends HTMLAttributes<HTMLDivElement> {
  count?: number;
  color?: string;
  blur?: number;
  speed?: number;
  length?: string;
}

type LightRay = {
  id: string;
  left: number;
  rotate: number;
  width: number;
  swing: number;
  delay: number;
  duration: number;
  intensity: number;
};

/**
 * Equal-spaced rays from the top-left and top-right corners, shining down.
 * Positions are deterministic so left/right stay balanced across renders.
 */
function createCornerRays(count: number, cycle: number): LightRay[] {
  const n = Math.max(2, count);
  const leftCount = Math.ceil(n / 2);
  const rightCount = n - leftCount;
  const rays: LightRay[] = [];

  const pushSide = (
    side: "left" | "right",
    sideCount: number,
    start: number,
    span: number
  ) => {
    for (let i = 0; i < sideCount; i += 1) {
      const t = sideCount === 1 ? 0.5 : i / (sideCount - 1);
      const left = start + t * span;
      const rotate =
        side === "left" ? -26 + t * 14 : 12 + t * 14;
      const width = 90 + ((i * 29) % 56);
      const swing = 0.22 + (i % 3) * 0.08;
      const delay = (i / Math.max(sideCount, 1)) * cycle * 0.4;
      const duration = cycle * (1.05 + (i % 2) * 0.2);
      const intensity = 0.09 + (i % 3) * 0.03;
      rays.push({
        id: `${side}-${i}`,
        left,
        rotate,
        width,
        swing,
        delay,
        duration,
        intensity,
      });
    }
  };

  pushSide("left", leftCount, 6, 26);
  pushSide("right", rightCount, 68, 26);
  return rays;
}

function Ray({
  left,
  rotate,
  width,
  swing,
  delay,
  duration,
  intensity,
  staticRay,
}: LightRay & { staticRay: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute -top-[18%] left-[var(--ray-left)] h-[var(--light-rays-length)] w-[var(--ray-width)] origin-top -translate-x-1/2 rounded-full bg-linear-to-b from-[color-mix(in_oklch,var(--light-rays-color)_22%,transparent)] to-transparent blur-[var(--light-rays-blur)]"
      style={
        {
          "--ray-left": `${left}%`,
          "--ray-width": `${width}px`,
        } as CSSProperties
      }
      initial={{ rotate, opacity: staticRay ? intensity * 0.85 : intensity * 0.7 }}
      animate={
        staticRay
          ? { rotate, opacity: intensity * 0.85 }
          : {
              opacity: [intensity * 0.7, intensity, intensity * 0.7],
              rotate: [rotate - swing, rotate + swing, rotate - swing],
            }
      }
      transition={
        staticRay
          ? { duration: 0 }
          : {
              duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }
      }
    />
  );
}

export function LightRays({
  className,
  style,
  count = 6,
  color = "color-mix(in oklch, var(--ink) 14%, transparent)",
  blur = 72,
  speed = 32,
  length = "46vh",
  ...props
}: LightRaysProps) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const cycleDuration = Math.max(speed, 0.1);
  const rays = useMemo(
    () => createCornerRays(count, cycleDuration),
    [count, cycleDuration]
  );

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-[0.52]",
        className
      )}
      style={
        {
          "--light-rays-color": color,
          "--light-rays-blur": `${blur}px`,
          "--light-rays-length": length,
          ...style,
        } as CSSProperties
      }
      aria-hidden
      {...props}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 0%, black 28%, transparent 78%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 28%, transparent 78%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            background:
              "radial-gradient(ellipse 22% 28% at 8% 0%, color-mix(in oklch, var(--light-rays-color) 36%, transparent), transparent 72%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            background:
              "radial-gradient(ellipse 22% 28% at 92% 0%, color-mix(in oklch, var(--light-rays-color) 30%, transparent), transparent 72%)",
          }}
        />
        {rays.map((ray) => (
          <Ray key={ray.id} {...ray} staticRay={Boolean(reduced)} />
        ))}
      </div>
    </div>
  );
}
