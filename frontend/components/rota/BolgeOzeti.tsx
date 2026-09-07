"use client";

import { useMemo } from "react";
import { AlertTriangleIcon, MapIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import type { Bolge } from "@/lib/rota/bolge";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BolgeOzetiProps {
  bolgeler: Bolge[];
  /** musteriKodu → aracAd. Plana girmemiş durak haritada olmaz. */
  durakAraci: Map<string, string>;
  loading: boolean;
}

interface Satir {
  bolge: Bolge;
  /** Bu bölgeyi taşıyan araçlar. Birden fazlaysa bölge bölünmüş. */
  araclar: string[];
  atanmamis: number;
}

/**
 * Bölge → yük → araç tablosu.
 *
 * Araç kartları "bu araçta ne var" sorusunu cevaplıyor; buradaki soru tersi:
 * "bu bölgeye kim gidiyor, bölündü mü". Bölünmüş bölge sahada aynı ilçeye iki
 * kez gitmek demek — ekranda görünmezse fark edilmiyor.
 */
export function BolgeOzeti({ bolgeler, durakAraci, loading }: BolgeOzetiProps) {
  const satirlar = useMemo<Satir[]>(() => {
    return bolgeler
      .map((bolge) => {
        const araclar = new Set<string>();
        let atanmamis = 0;
        for (const d of bolge.duraklar) {
          const arac = durakAraci.get(d.musteriKodu);
          if (arac) araclar.add(arac);
          else atanmamis += 1;
        }
        return { bolge, araclar: [...araclar], atanmamis };
      })
      // Uzak bölgeler üstte: planlamada ilk karar verilmesi gerekenler onlar.
      .sort((a, b) => b.bolge.depoyaKm - a.bolge.depoyaKm);
  }, [bolgeler, durakAraci]);

  const bolunmus = satirlar.filter((s) => s.araclar.length > 1).length;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <section
      ref={wrapperRef}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border"
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <MapIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="truncate">Bölgeler</span>
        </h2>
        {bolunmus > 0 ? (
          <span
            className="flex shrink-0 cursor-help items-center gap-1 text-[11.5px] font-medium text-amber-600 dark:text-amber-400"
            title="Aynı bölgeye birden fazla araç gidiyor — sahada aynı ilçeye iki kez gitmek demek."
          >
            <AlertTriangleIcon className="size-3" strokeWidth={2} aria-hidden />
            {formatNumber(bolunmus)} bölünmüş
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums">
            {formatNumber(satirlar.length)}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {satirlar.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">
            {loading ? "Bölgeler hesaplanıyor…" : "Bekleyen yük yok."}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map(({ bolge, araclar, atanmamis }) => (
              <li
                key={bolge.kod + bolge.ad}
                className="flex min-w-0 flex-col gap-1 px-3.5 py-2"
                title={
                  bolge.ilceler.length > 0
                    ? `İlçeler: ${bolge.ilceler.join(", ")}`
                    : "İlçe bilgisi olmayan duraklar koordinata göre kümelendi"
                }
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {bolge.ad}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                    {formatNumber(bolge.duraklar.length)} durak ·{" "}
                    {formatKg(Math.round(bolge.kg))} · {Math.round(bolge.depoyaKm)} km
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {araclar.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      araca atanmadı
                    </span>
                  ) : (
                    araclar.map((a) => (
                      <span
                        key={a}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[11px]",
                          araclar.length > 1
                            ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                            : "border-border/70 text-muted-foreground"
                        )}
                      >
                        {a}
                      </span>
                    ))
                  )}
                  {atanmamis > 0 && araclar.length > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      +{formatNumber(atanmamis)} havuzda
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}
