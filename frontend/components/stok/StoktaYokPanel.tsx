"use client";

import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { StokSatiri } from "@/hooks/useStokRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StoktaYokPanelProps {
  satirlar: StokSatiri[];
  loading: boolean;
}

/**
 * Sayfanın en aksiyona dönük parçası: miktarı sıfır olan ürünler. Sıralama
 * birim fiyata göre — tükenmiş pahalı ürün, tükenmiş ucuz üründen önce gelir.
 *
 * Durum rengi (destructive) yalnızca burada ve KPI kutusunda; dağılım
 * grafiğinin hue'suyla karışmasın diye grafik tarafında hiç kullanılmıyor.
 *
 * Alt kenar çizgisi bilinçli olarak yok — satır çift sütunun ortak alt
 * sınırını page.tsx'teki grid sarmalayıcı çiziyor (bkz. o dosyadaki not).
 */
export function StoktaYokPanel({ satirlar, loading }: StoktaYokPanelProps) {
  const bos = satirlar.length === 0;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <section ref={wrapperRef} className="relative flex min-w-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <AlertTriangleIcon
            className={cn("size-3.5", !bos && "text-destructive")}
            strokeWidth={1.75}
            aria-hidden
          />
          Stokta yok
        </h2>
        {!bos ? (
          <span className="font-mono text-[12.5px] font-medium text-destructive tabular-nums">
            {formatNumber(satirlar.length)}
          </span>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {bos ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <CheckCircle2Icon
              className="size-6 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[13px] text-muted-foreground">
              Seçili kapsamda tükenmiş ürün yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map((s) => (
              <li
                key={s.urunKodu}
                className="flex min-w-0 items-center gap-3 px-3.5 py-2"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-destructive"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-foreground">
                    {s.urun}
                  </span>
                  <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                    {s.urunKodu}
                    {s.marka ? ` · ${s.marka}` : ""}
                  </span>
                </span>
                <span
                  className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums"
                  title="Birim fiyat"
                >
                  {formatCurrency(s.fiyat)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}
