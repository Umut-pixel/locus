"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

interface GsapAutoHeightProps {
  children: ReactNode;
  className?: string;
}

/**
 * İçeriğin doğal yüksekliği her değiştiğinde (sekme değişimi, liste
 * büyüyüp küçülmesi) sarmalayıcının yüksekliğini GSAP ile yumuşak geçirir.
 *
 * `GsapCollapse`ten farkı: açık/kapalı bir `open` prop'u ile değil, İÇERİK
 * DEĞİŞTİĞİNDE kendiliğinden tetikleniyor — bir `ResizeObserver` iç
 * sarmalayıcıyı izliyor. Örn. "Araçlar" sekmesinden "Bölgeler"e geçilince
 * liste uzunluğu değişir, kutunun boyu anında zıplamak yerine akıcı büyür/
 * küçülür.
 */
export function GsapAutoHeight({ children, className }: GsapAutoHeightProps) {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;

    let ilk = true;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h == null) return;
      gsap.killTweensOf(wrap);
      if (ilk || reduced) {
        gsap.set(wrap, { height: h });
        ilk = false;
        return;
      }
      gsap.to(wrap, { height: h, duration: 0.3, ease: "power2.out" });
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [reduced]);

  return (
    <div ref={wrapRef} className={cn("overflow-hidden", className)}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
