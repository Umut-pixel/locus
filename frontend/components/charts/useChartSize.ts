"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

interface ChartSizeOptions {
  /** Yükseklik = genişlik × ratio, min/max ile sınırlanır. */
  ratio: number;
  minHeight: number;
  maxHeight: number;
}

/**
 * Kabı ölçer ve SVG'yi gerçek piksel uzayında çizmemizi sağlar.
 *
 * Yükseklik CSS `aspect-ratio` ile veriliyor (JS'le hesaplanmıyor): ilk boyama
 * doğru yükseklikle geliyor, ölçüm sonrası sıçrama olmuyor. Oran + min/max,
 * grafiğin geniş ekranda 9:1'lik bir şeride dönüşmesini engelliyor.
 */
export function useChartSize<T extends HTMLElement>({
  ratio,
  minHeight,
  maxHeight,
}: ChartSizeOptions) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (w: number, h: number) => {
      setSize((prev) =>
        Math.abs(prev.width - w) < 0.5 && Math.abs(prev.height - h) < 0.5
          ? prev
          : { width: w, height: h }
      );
    };

    const rect = el.getBoundingClientRect();
    apply(rect.width, rect.height);

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });
    ro.observe(el);

    // Emniyet kemeri: ResizeObserver'ın atladığı bir durumda grafik eski
    // genişlikte donup sağdan kesik kalmasın.
    const onResize = () => {
      const r = el.getBoundingClientRect();
      apply(r.width, r.height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // `width: 100%` şart: genişlik belirsiz bırakılırsa `aspect-ratio` ile
  // `max-height` birbirini besliyor ve kutu maxHeight/ratio genişliğine
  // kilitleniyor — grafik geniş ekranda sağdan kesik kalıyor.
  const style: CSSProperties = {
    width: "100%",
    aspectRatio: `1 / ${ratio}`,
    minHeight,
    maxHeight,
  };

  return {
    ref,
    style,
    width: Math.round(size.width),
    height: Math.round(size.height),
    /** İlk ölçüm gelmeden çizim yapma — yoksa 0 genişlikli path üretilir. */
    ready: size.width > 8 && size.height > 8,
  };
}
