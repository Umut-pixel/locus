"use client";

import { useMemo } from "react";

import {
  stokDagilimi,
  type StokBoyut,
  type StokSatiri,
} from "@/hooks/useStokRaporu";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StokDagilimProps {
  satirlar: StokSatiri[];
  boyut: StokBoyut;
  onBoyutChange: (boyut: StokBoyut) => void;
  loading: boolean;
  /** Bara tıklayınca o dilim filtreye yazılır. */
  onDilimSec: (ad: string) => void;
  seciliDilim: string | null;
}

/**
 * Sıralı yatay bar — tek ölçüt (stok değeri), nominal kategoriler.
 *
 * Bar başına ayrı renk kullanılmıyor: kategorilerin doğal bir sırası yok ve
 * uzunluk değeri zaten kodluyor; renge de aynı bilgiyi yükleseydik tek boş
 * kanalı harcar, üstelik hue rampası parlaklık bandından taşardı. Tek hue
 * (`--chart-stok`) + uçta doğrudan etiket. Marka adları uzun olduğu için
 * yatay; dikey sütunda etiketler eğik yazılmak zorunda kalırdı.
 */
export function StokDagilim({
  satirlar,
  boyut,
  onBoyutChange,
  loading,
  onDilimSec,
  seciliDilim,
}: StokDagilimProps) {
  const dilimler = useMemo(() => stokDagilimi(satirlar, boyut), [satirlar, boyut]);

  return (
    <section className="flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Stok değeri dağılımı
        </h2>
        <div
          role="group"
          aria-label="Dağılım kırılımı"
          className="flex items-center gap-0.5 rounded-md bg-secondary/60 p-0.5"
        >
          {(["marka", "kategori"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onBoyutChange(b)}
              aria-pressed={boyut === b}
              className={cn(
                "h-6 rounded-[5px] px-2 text-[12px] font-medium capitalize transition-colors",
                boyut === b
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </header>

      {/* Yükleme sırasında iskelet yerine önceki render sönük tutulur — sıçrama olmaz. */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3.5 py-3 transition-opacity",
          loading && "opacity-40"
        )}
      >
        {dilimler.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            Gösterilecek {boyut} yok.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {dilimler.map((d) => {
              const secili = seciliDilim === d.ad;
              return (
                <li key={d.ad}>
                  <button
                    type="button"
                    onClick={() => onDilimSec(d.ad)}
                    aria-pressed={secili}
                    title={`${d.ad} — ${formatCurrency(d.brutTutar)} · ${formatNumber(d.urunAdet)} ürün · ${formatNumber(d.miktar)} adet · toplam stok değerinin %${(d.pay * 100).toFixed(1)}'i`}
                    className={cn(
                      "group flex w-full min-w-0 flex-col gap-1 rounded-md px-1.5 py-1 text-left transition-colors",
                      "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      secili && "bg-muted/50"
                    )}
                  >
                    <span className="flex min-w-0 items-baseline justify-between gap-3">
                      <span
                        className={cn(
                          "min-w-0 truncate text-[13px]",
                          secili ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {d.ad}
                      </span>
                      {/* Barın ucundaki değer — kolonda hizalandığı için tabular. */}
                      <span className="shrink-0 font-mono text-[12.5px] text-foreground tabular-nums">
                        {formatCurrency(d.brutTutar)}
                      </span>
                    </span>
                    {/*
                      Bar: 8px ince, veri ucu 4px yuvarlak, taban tarafı köşeli.
                      Track tek adım açık yüzey — bar yoksa da satır okunur.
                    */}
                    <span
                      className="block h-2 w-full overflow-hidden rounded-[2px] bg-secondary"
                      role="img"
                      aria-label={`${d.ad}: toplam stok değerinin yüzde ${(d.pay * 100).toFixed(1)}'i`}
                    >
                      <span
                        className="block h-full rounded-r-[4px] transition-[width] duration-300 ease-out"
                        style={{
                          width: `${Math.max(d.oran * 100, d.brutTutar > 0 ? 1.5 : 0)}%`,
                          backgroundColor: "var(--chart-stok)",
                        }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
