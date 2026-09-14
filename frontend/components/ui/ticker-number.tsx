"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
 *
 * `vurguDegisim` açıkken değişim yönünde bir renk katmanı biner (artış
 * `--success`, azalış `--destructive`) ve sayım bitince söner. GSAP'ın
 * `color` tween'i oklch değerlerini güvenilir yorumlamıyor, o yüzden renk
 * doğrudan tween EDİLMİYOR: her zaman görünen normal-renkli taban metnin
 * üstüne, aynı metni taşıyan renkli bir kopya OPACITY ile belirip kayboluyor
 * (fade in/out) — ucuz (yalnız opacity, layout/reflow yok), animasyon
 * boyunca `will-change` açılıp hemen sonra kapatılıyor.
 */
export function TickerNumber({
  value,
  format,
  duration = 0.62,
  className,
  vurguDegisim = false,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
  /** Değer artınca/azalınca yeşil/kırmızı fade — bkz. dosya başı yorumu. */
  vurguDegisim?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const vurguRef = useRef<HTMLSpanElement>(null);
  const oncekiRef = useRef(value);
  const [yon, setYon] = useState<"artti" | "azaldi" | null>(null);
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

    const vurguEl = vurguDegisim ? vurguRef.current : null;
    if (vurguEl) {
      setYon(artiyor ? "artti" : "azaldi");
      gsap.killTweensOf(vurguEl);
      vurguEl.style.willChange = "opacity";
      gsap
        .timeline({
          onComplete: () => {
            vurguEl.style.willChange = "";
          },
        })
        .fromTo(vurguEl, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: "power2.out" }, 0)
        .to(vurguEl, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, Math.max(duration, 0.42));
    }

    return () => {
      tl.kill();
      el.style.fontVariantNumeric = "";
      el.style.willChange = "";
      gsap.set(el, { yPercent: 0, opacity: 1 });
      if (vurguEl) {
        gsap.killTweensOf(vurguEl);
        gsap.set(vurguEl, { opacity: 0 });
        vurguEl.style.willChange = "";
      }
    };
  }, [value, duration, reduced, vurguDegisim]);

  if (!vurguDegisim) {
    return (
      <span ref={ref} className={cn("inline-block", className)}>
        {format(gosterilen)}
      </span>
    );
  }

  return (
    <span className={cn("relative inline-block", className)}>
      <span ref={ref} className="inline-block">
        {format(gosterilen)}
      </span>
      <span
        ref={vurguRef}
        aria-hidden
        style={{ opacity: 0 }}
        className={cn(
          "pointer-events-none absolute inset-0 inline-block",
          yon === "artti" ? "text-success" : yon === "azaldi" ? "text-destructive" : ""
        )}
      >
        {format(gosterilen)}
      </span>
    </span>
  );
}
