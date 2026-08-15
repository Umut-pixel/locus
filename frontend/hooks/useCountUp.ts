"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sayısal değeri GSAP ile hedefe doğru sayar — sayfa yüklenince ilk değere,
 * sonraki her değişimde (filtre, dilim tıklama) yeni hedefe. Lazy-load +
 * prefers-reduced-motion önceliği route-reveal.ts'deki desenle aynı.
 */
export function useCountUp(value: number, duration = 0.9): number {
  const [gosterilen, setGosterilen] = useState(value);
  const gosterilenRef = useRef(value);
  const tweenRef = useRef<{ kill: () => void } | null>(null);

  useEffect(() => {
    if (value === gosterilenRef.current) return;

    let cancelled = false;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // setState'i mikrotaska erteliyoruz — effect gövdesinde senkron
      // çağrılmasın (bkz. react-hooks/set-state-in-effect), gsap dalıyla
      // aynı "callback içinde güncelle" deseni.
      queueMicrotask(() => {
        if (cancelled) return;
        gosterilenRef.current = value;
        setGosterilen(value);
      });
      return () => {
        cancelled = true;
      };
    }

    tweenRef.current?.kill();

    import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;
      const state = { v: gosterilenRef.current };
      tweenRef.current = gsap.to(state, {
        v: value,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          gosterilenRef.current = state.v;
          setGosterilen(state.v);
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [value, duration]);

  // Unmount'ta tween'i durdur — state güncellemesi devam eden bileşene sızmasın.
  useEffect(() => {
    return () => tweenRef.current?.kill();
  }, []);

  return gosterilen;
}
