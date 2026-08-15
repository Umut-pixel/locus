"use client";

import { useEffect, useRef, useState } from "react";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DonutDilim {
  ad: string;
  deger: number;
  /** 0–1, toplam içindeki pay — açı buradan hesaplanır. */
  pay: number;
  renk: string;
}

interface DonutProps {
  dilimler: DonutDilim[];
  merkezEtiket: string;
  merkezDeger: string;
  seciliAd?: string | null;
  onDilimSec?: (ad: string) => void;
  loading?: boolean;
}

// Sabit viewBox koordinatı (0–100) — SVG genişlik/yükseklik CSS ile %100
// verildiği için piksel boyutu tamamen konteynerden geliyor, JS ölçüm yok.
const CX = 50;
const CY = 50;
const R_DIS = 47;
const R_IC = R_DIS * 0.6;
const R_ORTA = (R_DIS + R_IC) / 2;
const HALKA_KALINLIK = R_DIS - R_IC;
const CEVRE = 2 * Math.PI * R_ORTA;
const BOSLUK_UZUNLUK = 0.02 * R_ORTA; // dilimler arası yüzey boşluğu (kenarlık değil)

/**
 * Donut — kategorik dilimler, tek bakışta parça-bütün hikayesi (≤6 dilim).
 * d3-shape/visx yerine düz SVG: uygulamada hiç grafik kütüphanesi yok, tek
 * pasta için bağımlılık ağacı büyütmeye değmedi.
 *
 * Geometri `stroke-dasharray`/`stroke-dashoffset` ile — dolgulu path arc
 * DEĞİL. İki sebep: (1) giriş animasyonu saat gibi baştan sona "çizilerek"
 * dönüyor, bunu her karede path `d`'sini yeniden hesaplayarak yapmak SVG
 * geometrisini her frame'de tekrar tessellate ettirip gerçek bir lag
 * kaynağıydı; dash uzunluğu düz bir sayı, GSAP bunu React'e hiç uğramadan
 * doğrudan DOM'a yazıyor. (2) hover büyümesi de aynı sebeple `d` yerine
 * `stroke-width`/`transform` kullanıyor — ikisi de compositor-dostu.
 *
 * İki net bölge: sol taraf grafiğin kendisi (konteyner yüksekliği ne kadarsa
 * o kadar büyür — aspect-square, JS ölçüm yok, viewBox ile CSS ölçekliyor),
 * sağ taraf "veri" bölgesi — legend aynı zamanda tablo görünümü, her satırda
 * hem pay hem tutar okunuyor, dikeyde ortalanıp konteyneri dolduruyor.
 *
 * Dilim rengi çağıran taraftan gelir (StokDagilim) — bileşen renk atamasını
 * bilmez, yalnızca çizer. "Diğer" dilimi tıklanamaz: tek bir gerçek
 * marka/kategori değerine karşılık gelmediği için filtreye yazılamaz.
 */
export function Donut({
  dilimler,
  merkezEtiket,
  merkezDeger,
  seciliAd,
  onDilimSec,
  loading,
}: DonutProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const legendRef = useRef<HTMLUListElement | null>(null);

  // Kümülatif ofset (çevre biriminde) — mutasyonsuz: her dilimin ham
  // uzunluğu bir önceki adımdan türetiliyor, hiçbir yakalanmış değişken
  // render sırasında değiştirilmiyor.
  const hamUzunluklar = dilimler.map((d) => Math.max(d.pay * CEVRE, 0.4));
  const kumUzunluklar = hamUzunluklar.reduce<number[]>((acc, u) => {
    const onceki = acc.length > 0 ? acc[acc.length - 1]! : 0;
    return [...acc, onceki + u];
  }, []);
  const geometri = dilimler.map((d, i) => {
    const baslangicOfset = i === 0 ? 0 : kumUzunluklar[i - 1]!;
    const gorunurUzunluk = Math.max(hamUzunluklar[i]! - BOSLUK_UZUNLUK, 0.3);
    return {
      ...d,
      dashoffset: -(baslangicOfset + BOSLUK_UZUNLUK / 2),
      gorunurUzunluk,
      baslangicOfset,
    };
  });

  // Dilim içeriği gerçekten değişince (sayfa yüklenince, boyut/filtre
  // değişince) dilimler ve legend satırları birlikte belirir. `useEffect`'in
  // kendi bağımlılık karşılaştırması zaten "imza aynıysa yeniden çalıştırma"
  // işini görüyor, ayrı bir ref-guard'a gerek yok.
  //
  // Gizleme adımı KASITLI olarak GSAP yüklenmiş async callback'in içinde —
  // efekt gövdesinde değil. StrictMode geliştirmede her efekti bilerek iki
  // kez çalıştırıyor (mount→cleanup→mount); gizleme senkron olsaydı ilk
  // çalıştırma dilimleri gizler, hemen iptal edilirdi (cleanup geri açar),
  // ikinci çalıştırma tekrar gizleyip animasyonu başlatırdı — kullanıcı
  // görünüyor→kapanıyor→tekrar açılıyor diye gözle görülür bir titreşim
  // yaşardı. Gizleme + animasyon başlatma artık TEK ATOMİK adım: yalnızca
  // hayatta kalacağı kesinleşen (iptal edilmeyen) çalıştırma dilimlere
  // dokunuyor, doğrudan gizleyip aynı anda süpürmeyi başlatıyor.
  const imza = geometri.map((d) => `${d.ad}:${d.pay.toFixed(4)}`).join("|");
  useEffect(() => {
    if (!imza) return;

    const svgEl = svgRef.current;
    const legendEl = legendRef.current;
    if (!svgEl || !legendEl) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const cemberEls = Array.from(
      svgEl.querySelectorAll<SVGCircleElement>("[data-donut-slice]")
    );
    const satirEls = legendEl.querySelectorAll("[data-donut-legend]");
    if (cemberEls.length === 0) return;

    let cancelled = false;
    let sweepTween: { kill: () => void } | null = null;
    let legendTween: { kill: () => void } | null = null;

    import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;

      // Süpürme başlamadan hepsini gizle — React zaten son değerlerle
      // render etmişti (reduced-motion/JS'siz durum için), burada aynı
      // karede hemen animasyona geçiliyor, ayrı bir "gizli" karesi yok.
      cemberEls.forEach((el) => {
        el.style.strokeDasharray = `0 ${CEVRE}`;
      });

      const state = { t: 0 };
      sweepTween = gsap.to(state, {
        t: 1,
        duration: 1.1,
        ease: "power1.inOut",
        onUpdate: () => {
          // Tek bir "süpürme" ilerlemesi tüm dilimleri sürüyor — saat
          // yönünde tepeden başlayıp sırayla her dilimi çiziyor. DOM'a
          // doğrudan yazılıyor (React re-render yok), 60fps'te ucuz.
          const sweepUzunluk = state.t * CEVRE;
          cemberEls.forEach((el, i) => {
            const g = geometri[i]!;
            const gorunur = Math.max(
              0,
              Math.min(g.gorunurUzunluk, sweepUzunluk - g.baslangicOfset)
            );
            el.style.strokeDasharray = `${gorunur} ${CEVRE - gorunur}`;
          });
        },
        onComplete: () => {
          // İnline stili temizle — React'in zaten doğru render ettiği
          // stroke-dasharray özniteliği devralsın, kalıntı stil kalmasın.
          cemberEls.forEach((el) => {
            el.style.strokeDasharray = "";
          });
        },
      });

      legendTween = gsap.fromTo(
        satirEls,
        { opacity: 0, x: -8 },
        {
          opacity: 1,
          x: 0,
          duration: 0.35,
          ease: "power2.out",
          stagger: 1.1 / Math.max(dilimler.length, 1),
        }
      );
    });

    return () => {
      cancelled = true;
      sweepTween?.kill();
      legendTween?.kill();
      // Efekt tamamlanmadan iptal edildiyse (StrictMode çift-çalıştırma,
      // hızlı ardışık değişim) dilimleri gizli bırakma — inline stili
      // temizleyip React'in render ettiği doğru son değere dön.
      cemberEls.forEach((el) => {
        el.style.strokeDasharray = "";
      });
    };
    // `geometri` kasıtlı dışarıda: `imza` zaten onun ürettiği tüm sayısal
    // alanları (ad+pay) kodluyor, o yüzden imza aynıyken geometri de eşdeğer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imza, dilimler.length]);

  const hoverli = hoverIdx != null ? geometri[hoverIdx] : null;
  const merkezGosterilenEtiket = hoverli ? hoverli.ad : merkezEtiket;
  const merkezGosterilenDeger = hoverli
    ? formatCurrency(hoverli.deger)
    : merkezDeger;
  const merkezAltBilgi = hoverli ? `%${(hoverli.pay * 100).toFixed(1)}` : null;

  return (
    <div className="flex h-full min-w-0 flex-1 items-stretch gap-6">
      {/* Sol bölge: grafik — genişliği yükseklikten türetiliyor (aspect-square). */}
      <div className="flex h-full shrink-0 items-center justify-center">
        <div
          className={cn(
            "relative aspect-square h-full max-h-[15rem] min-w-[8rem] transition-opacity",
            loading && "opacity-40"
          )}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label={`${merkezEtiket}: ${merkezDeger}, ${dilimler.length} dilim`}
          >
            {geometri.map((d, i) => {
              const secili = seciliAd === d.ad;
              const hoverdaki = hoverIdx === i;
              const soluk = hoverIdx != null && !hoverdaki;
              const tiklanabilir = d.ad !== "Diğer" && Boolean(onDilimSec);
              const kalinlik = secili
                ? HALKA_KALINLIK + 3
                : hoverdaki
                  ? HALKA_KALINLIK + 2
                  : HALKA_KALINLIK;
              return (
                <circle
                  key={d.ad}
                  data-donut-slice
                  cx={CX}
                  cy={CY}
                  r={R_ORTA}
                  fill="none"
                  stroke={d.renk}
                  strokeWidth={kalinlik}
                  strokeDasharray={`${d.gorunurUzunluk} ${CEVRE - d.gorunurUzunluk}`}
                  strokeDashoffset={d.dashoffset}
                  opacity={soluk ? 0.45 : 1}
                  className={cn(
                    "transition-[opacity,stroke-width] duration-150 ease-out",
                    tiklanabilir && "cursor-pointer"
                  )}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() =>
                    setHoverIdx((prev) => (prev === i ? null : prev))
                  }
                  onClick={tiklanabilir ? () => onDilimSec?.(d.ad) : undefined}
                >
                  <title>
                    {d.ad}: {formatCurrency(d.deger)} (%{(d.pay * 100).toFixed(1)})
                  </title>
                </circle>
              );
            })}
          </svg>

          {/* Merkez etiket — varsayılan toplam, hover'da o dilime döner. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-4 text-center">
            <span className="line-clamp-2 text-[12px] leading-tight text-muted-foreground">
              {merkezGosterilenEtiket}
            </span>
            <span className="font-mono text-[17px] leading-tight font-semibold text-foreground tabular-nums">
              {merkezGosterilenDeger}
            </span>
            {merkezAltBilgi ? (
              <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                {merkezAltBilgi}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Sağ bölge: veri — legend aynı zamanda tablo görünümü (pay + tutar), dikeyde ortalı. */}
      <ul ref={legendRef} className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        {geometri.map((d, i) => {
          const tiklanabilir = d.ad !== "Diğer" && Boolean(onDilimSec);
          const secili = seciliAd === d.ad;
          return (
            <li key={d.ad}>
              <button
                type="button"
                data-donut-legend
                disabled={!tiklanabilir}
                onClick={() => onDilimSec?.(d.ad)}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() =>
                  setHoverIdx((prev) => (prev === i ? null : prev))
                }
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                  tiklanabilir &&
                    "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  secili && "bg-muted/50"
                )}
              >
                <span
                  className="size-3 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: d.renk }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                  {d.ad}
                </span>
                <span className="shrink-0 font-mono text-[13px] text-muted-foreground tabular-nums">
                  {formatCurrency(d.deger)}
                </span>
                <span className="w-11 shrink-0 text-right font-mono text-[13px] font-medium text-foreground tabular-nums">
                  %{(d.pay * 100).toFixed(0)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
