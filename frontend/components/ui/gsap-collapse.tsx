"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

interface GsapCollapseProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Yükseklik animasyonlu açılır/kapanır sarmalayıcı — GSAP ile.
 *
 * `segmented-switch.tsx`'teki hibrit desenin genelleştirilmiş hâli:
 * `useLayoutEffect` + `gsap.killTweensOf` + azaltılmış hareket tercihinde düz
 * `gsap.set`, aksi halde `height` tween'i (gsap "auto"yu tween edemiyor,
 * bu yüzden açılırken ölçülen piksel yüksekliğine, kapanırken 0'a gidiyor).
 * `BolgeOzeti.tsx`teki tek-seferlik (mount'ta giren) önizleme panelinden
 * farkı: burada aynı öğe tekrar tekrar açılıp kapanabiliyor, `open` prop'u
 * ile sürülüyor.
 */
export function GsapCollapse({ open, children, className }: GsapCollapseProps) {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const ilkRef = useRef(true);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;

    gsap.killTweensOf(wrap);

    // İlk render: sıçramasın, doğrudan hedef durumda başlasın.
    if (ilkRef.current) {
      ilkRef.current = false;
      gsap.set(wrap, open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 });
      return;
    }

    if (reduced) {
      gsap.set(wrap, open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 });
      return;
    }

    if (open) {
      const hedef = inner.getBoundingClientRect().height;
      gsap.fromTo(
        wrap,
        { height: 0, opacity: 0 },
        {
          height: hedef,
          opacity: 1,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () => gsap.set(wrap, { height: "auto" }),
        }
      );
    } else {
      // "auto"dan tween edilemiyor — önce ölçülen piksele sabitlenip oradan
      // kapanıyor.
      const mevcut = inner.getBoundingClientRect().height;
      gsap.set(wrap, { height: mevcut });
      gsap.to(wrap, { height: 0, opacity: 0, duration: 0.24, ease: "power2.in" });
    }
  }, [open, reduced]);

  return (
    <div
      ref={wrapRef}
      className={cn("overflow-hidden", className)}
      style={{ height: 0, opacity: 0 }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
