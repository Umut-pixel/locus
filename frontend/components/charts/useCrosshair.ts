"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { clamp } from "./chart-math";

/**
 * Nişangâh + nokta + tooltip'i GSAP `quickTo` ile sürer.
 *
 * Konum React state'ine bağlanmıyor: fare her piksel oynadığında yeniden
 * render etmek yerine aynı tween'i besliyoruz — imleç bandı atlarken sıçramak
 * yerine kayıyor. React yalnızca aktif bant değiştiğinde (tooltip metni için)
 * güncelleniyor.
 */
export function useCrosshair(reduced: boolean, ready = true) {
  const ruleRef = useRef<SVGGElement>(null);
  const dotRef = useRef<SVGGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);
  const tweens = useRef<{
    ruleX: ReturnType<typeof gsap.quickTo>;
    dotX: ReturnType<typeof gsap.quickTo>;
    dotY: ReturnType<typeof gsap.quickTo>;
    tipX: ReturnType<typeof gsap.quickTo>;
  } | null>(null);

  // `ready`: ilk boyut ölçümü gelmeden SVG basılmıyor, o yüzden tween'leri
  // kurmak için elemanların DOM'a girmesini bekliyoruz.
  useLayoutEffect(() => {
    const rule = ruleRef.current;
    const dot = dotRef.current;
    const tip = tipRef.current;
    if (!ready || !rule || !dot || !tip) return;

    const duration = reduced ? 0 : 0.26;
    const ease = "power3.out";
    gsap.set([rule, dot], { autoAlpha: 0 });
    gsap.set(tip, { xPercent: -50, autoAlpha: 0 });
    tweens.current = {
      ruleX: gsap.quickTo(rule, "x", { duration, ease }),
      dotX: gsap.quickTo(dot, "x", { duration, ease }),
      dotY: gsap.quickTo(dot, "y", { duration, ease }),
      tipX: gsap.quickTo(tip, "x", { duration, ease }),
    };

    return () => {
      shownRef.current = false;
      tweens.current = null;
      gsap.killTweensOf([rule, dot, tip]);
    };
  }, [reduced, ready]);

  /** Tooltip kenardan taşmasın — ok ucu yerine kutuyu plot içinde tut. */
  const tipXFor = (x: number, wrapWidth: number) => {
    const half = (tipRef.current?.offsetWidth ?? 0) / 2 + 8;
    if (wrapWidth <= half * 2) return wrapWidth / 2;
    return clamp(x, half, wrapWidth - half);
  };

  const move = (x: number, y: number, wrapWidth: number) => {
    const tipX = tipXFor(x, wrapWidth);
    const t = tweens.current;

    if (!shownRef.current || !t) {
      gsap.set(ruleRef.current, { x });
      gsap.set(dotRef.current, { x, y });
      gsap.set(tipRef.current, { x: tipX });
      if (!shownRef.current) {
        gsap.to([ruleRef.current, dotRef.current, tipRef.current], {
          autoAlpha: 1,
          duration: reduced ? 0 : 0.18,
          ease: "power2.out",
          overwrite: "auto",
        });
        shownRef.current = true;
      }
      return;
    }

    t.ruleX(x);
    t.dotX(x);
    t.dotY(y);
    t.tipX(tipX);
  };

  const hide = () => {
    shownRef.current = false;
    gsap.to([ruleRef.current, dotRef.current, tipRef.current], {
      autoAlpha: 0,
      duration: reduced ? 0 : 0.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  return { ruleRef, dotRef, tipRef, move, hide };
}
