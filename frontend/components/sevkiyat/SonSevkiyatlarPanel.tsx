"use client";

import { useMemo } from "react";
import { PackageCheckIcon, TruckIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import { MusteriAdIlce } from "@/components/sevkiyat/MusteriAdIlce";
import type { SevkiyatSatiri } from "@/hooks/useSevkiyatRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency, formatDate, formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SonSevkiyatlarPanelProps {
  satirlar: SevkiyatSatiri[];
  loading: boolean;
}

/** Uzun listeyi kısaltma — panel zaten kaydırılabilir, tamamı DOM'a basılmasın. */
const GOSTERILEN = 40;

/**
 * En son sevk edilen siparişler — SevkiyatRaporuKup'tan (5130), aracın
 * yüklendiği güne göre en yeniden eskiye.
 *
 * Kaynak seçimi bilinçli: Sipariş Durum Raporu'nun (5140) `sevk_tarihi`
 * alanı nominal (aynı belgede 5130 "11.08" derken 5140 "12.08" diyor), 5130
 * ise gerçek yükleme kaydı — plaka, ağırlık ve ödeme tipi de orada.
 */
export function SonSevkiyatlarPanel({ satirlar, loading }: SonSevkiyatlarPanelProps) {
  const gorunen = useMemo(() => satirlar.slice(0, GOSTERILEN), [satirlar]);
  const bos = gorunen.length === 0;

  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    gorunen.length
  );

  const enSonTarih = satirlar[0]?.tarih ?? null;

  return (
    <section ref={wrapperRef} className="relative flex min-w-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <PackageCheckIcon
            className={cn("size-3.5", !bos && "text-emerald-400")}
            strokeWidth={1.75}
            aria-hidden
          />
          Son sevk edilenler
        </h2>
        {!bos ? (
          <span
            className="font-mono text-[12.5px] font-medium text-emerald-400 tabular-nums"
            title={`En son sevkiyat: ${formatDate(enSonTarih)}. Toplam ${formatNumber(satirlar.length)} sevkiyat kaydı var, ilk ${GOSTERILEN} tanesi listeleniyor.`}
          >
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
            <TruckIcon
              className="size-6 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[13px] text-muted-foreground">
              Sevkiyat kaydı yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {gorunen.map((s) => (
              <li
                key={s.belgeKod}
                className="flex min-w-0 items-center gap-3 px-3.5 py-2"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-emerald-400"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <MusteriAdIlce
                    ad={s.musteriUnvani ?? s.musteriKodu ?? "—"}
                    ilce={s.ilce}
                    className="text-[13px] text-foreground"
                  />
                  <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                    #{s.belgeKod}
                    {s.agirlikKg > 0 ? ` · ${formatKg(s.agirlikKg)}` : ""}
                    {s.odemeTipi ? ` · ${s.odemeTipi}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
                    {formatCurrency(s.tutar)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(s.tarih)}
                    {s.gunOnce != null && s.gunOnce >= 0
                      ? ` · ${s.gunOnce === 0 ? "bugün" : `${formatNumber(s.gunOnce)} gün önce`}`
                      : ""}
                  </span>
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
