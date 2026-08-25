"use client";

import { useMemo } from "react";
import { CalendarClockIcon, CheckCircle2Icon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import {
  SKT_KRITIK_GUN,
  SKT_UYARI_GUN,
  type UrunSktOzeti,
} from "@/hooks/useUrunSkt";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SktYaklasanPanelProps {
  ozetler: Map<string, UrunSktOzeti>;
  /** Stoktaki miktar — SKT'si yaklaşan ama stoğu bitmiş ürün öncelik değil. */
  stokMiktarlari: Map<string, number>;
  loading: boolean;
}

/**
 * SKT'si geçmiş veya yaklaşan ürünler — Melih'in "tarihi yakın olan ürünler"
 * talebinin ekran karşılığı.
 *
 * Stoğu sıfır olanlar listelenmiyor: raf ömrü dolmuş ama elde kalmamış ürün
 * aksiyon gerektirmiyor, listeyi şişirir.
 */
export function SktYaklasanPanel({
  ozetler,
  stokMiktarlari,
  loading,
}: SktYaklasanPanelProps) {
  const satirlar = useMemo(() => {
    return [...ozetler.values()]
      .filter((o) => o.gunKalan != null && o.gunKalan <= SKT_UYARI_GUN)
      .map((o) => ({ ...o, stok: stokMiktarlari.get(o.urunKodu) ?? 0 }))
      .filter((o) => o.stok > 0)
      .sort((a, b) => (a.gunKalan ?? 0) - (b.gunKalan ?? 0));
  }, [ozetler, stokMiktarlari]);

  const bos = satirlar.length === 0;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <section ref={wrapperRef} className="relative flex min-w-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <CalendarClockIcon
            className={cn("size-3.5", !bos && "text-amber-400")}
            strokeWidth={1.75}
            aria-hidden
          />
          SKT yaklaşanlar
        </h2>
        {!bos ? (
          <span className="font-mono text-[12.5px] font-medium text-amber-400 tabular-nums">
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
              {SKT_UYARI_GUN} gün içinde SKT&apos;si dolan stoklu ürün yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map((s) => {
              const gun = s.gunKalan ?? 0;
              const gecti = gun < 0;
              const kritik = gun >= 0 && gun <= SKT_KRITIK_GUN;
              return (
                <li
                  key={s.urunKodu}
                  className="flex min-w-0 items-center gap-3 px-3.5 py-2"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      gecti || kritik ? "bg-destructive" : "bg-amber-400"
                    )}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-foreground">
                      {s.urunAdi}
                    </span>
                    <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                      {s.urunKodu} · {formatNumber(s.stok)} adet
                      {s.partiNo ? ` · parti ${s.partiNo}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span
                      className={cn(
                        "font-mono text-[12.5px] font-medium tabular-nums",
                        gecti || kritik ? "text-destructive" : "text-amber-400"
                      )}
                    >
                      {gecti
                        ? `${formatNumber(Math.abs(gun))} gün geçti`
                        : `${formatNumber(gun)} gün`}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {/* Kapsam kısmiyse tarih iyimser olabilir — "~" bunu söyler. */}
                      {s.kapsam === "kismi" ? "~" : ""}
                      {formatDate(s.enYakinSkt)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}
