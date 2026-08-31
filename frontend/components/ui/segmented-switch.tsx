"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  title?: string;
};

export function SegmentedSwitch<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
}) {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const readyRef = useRef(false);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!track || !pill) return;

    const layout = (animate: boolean) => {
      const index = options.findIndex((o) => o.value === value);
      const btn = btnRefs.current[index];
      if (!btn) return;
      const tr = track.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      const x = br.left - tr.left;
      const width = br.width;
      gsap.killTweensOf(pill);
      if (!animate || reduced) {
        gsap.set(pill, { x, width, opacity: 1 });
        return;
      }
      gsap.to(pill, {
        x,
        width,
        opacity: 1,
        duration: 0.32,
        ease: "power3.out",
        overwrite: true,
      });
    };

    layout(readyRef.current);
    readyRef.current = true;
    const ro = new ResizeObserver(() => layout(false));
    ro.observe(track);
    return () => ro.disconnect();
  }, [value, options, reduced]);

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={ariaLabel}
      className="relative isolate flex items-center rounded-md bg-muted/80 p-0.5"
    >
      <span
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0 z-0 rounded-[5px] bg-background shadow-xs"
        style={{ opacity: 0 }}
      />
      {options.map((s, i) => (
        <button
          key={s.value}
          ref={(el) => {
            btnRefs.current[i] = el;
          }}
          type="button"
          onClick={() => onChange(s.value)}
          aria-pressed={value === s.value}
          title={s.title}
          className={cn(
            "relative z-[1] h-6 rounded-[5px] px-2 text-[12px] font-medium",
            "transition-colors duration-200 ease-out",
            value === s.value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
