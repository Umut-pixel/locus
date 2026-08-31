"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";

/**
 * Sayaç — hedefe doğru sayar ve yönü belli eder: artarken yukarıdan, azalırken
 * aşağıdan yerine oturur.
 *
 * Sayarken `tabular-nums` açılıyor; orantılı rakamlarla genişlik her karede
 * değiştiği için metin titriyor. Sayım bitince tekrar orantılıya dönüyor —
 * duran büyük rakam öyle daha derli toplu duruyor.
 */
export function TickerNumber({
  value,
  format,
  duration = 0.62,
  className,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const oncekiRef = useRef(value);
  const gosterilen = useCountUp(value, duration);

  useLayoutEffect(() => {
    const el = ref.current;
    const onceki = oncekiRef.current;
    oncekiRef.current = value;
    if (!el || value === onceki || reduced) return;

    const artiyor = value > onceki;
    el.style.fontVariantNumeric = "tabular-nums";
    // will-change sadece animasyon boyunca: kalıcı bırakmak her sayacı
    // gereksiz yere ayrı bir compositor katmanında tutuyor.
    el.style.willChange = "transform, opacity";

    const tl = gsap.timeline({
      onComplete: () => {
        el.style.fontVariantNumeric = "";
        el.style.willChange = "";
      },
    });
    tl.fromTo(
      el,
      { yPercent: artiyor ? 16 : -16, opacity: 0.35 },
      { yPercent: 0, opacity: 1, duration: 0.42, ease: "power3.out" },
      0
    );
    // Boş tween: sayım bitene kadar tabular-nums açık kalsın.
    tl.to({}, { duration }, 0);

    return () => {
      tl.kill();
      el.style.fontVariantNumeric = "";
      el.style.willChange = "";
      gsap.set(el, { yPercent: 0, opacity: 1 });
    };
  }, [value, duration, reduced]);

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      {format(gosterilen)}
    </span>
  );
}
