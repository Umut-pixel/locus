"use client";

import { useMemo } from "react";

import type { TahsilatGunu } from "@/hooks/useTahsilatRaporu";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TahsilatTrendiProps {
  gunler: TahsilatGunu[];
  loading: boolean;
}

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_Y = 12;

export function TahsilatTrendi({ gunler, loading }: TahsilatTrendiProps) {
  const { path, alanPath, maxDeger, toplam } = useMemo(() => {
    if (gunler.length === 0) {
      return { path: "", alanPath: "", maxDeger: 0, toplam: 0 };
    }
    const max = Math.max(...gunler.map((g) => g.tutar), 1);
    const toplam = gunler.reduce((a, g) => a + g.tutar, 0);
    const usableH = VIEW_H - PAD_Y * 2;
    const stepX = gunler.length > 1 ? VIEW_W / (gunler.length - 1) : 0;

    const noktalar = gunler.map((g, i) => {
      const x = gunler.length > 1 ? i * stepX : VIEW_W / 2;
      const y = PAD_Y + usableH - (g.tutar / max) * usableH;
      return { x, y };
    });

    const path = noktalar
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const alanPath =
      noktalar.length > 0
        ? `${path} L${noktalar[noktalar.length - 1]!.x.toFixed(1)},${VIEW_H} L${noktalar[0]!.x.toFixed(1)},${VIEW_H} Z`
        : "";

    return { path, alanPath, maxDeger: max, toplam };
  }, [gunler]);

  const ilkGun = gunler[0]?.tarih ?? null;
  const sonGun = gunler[gunler.length - 1]?.tarih ?? null;

  return (
    <section className="flex min-w-0 flex-col border-b border-border">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Günlük nakit trendi
        </h2>
        <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
          {formatCurrency(toplam)}
          <span className="ml-1.5 font-sans text-[11.5px] font-normal text-muted-foreground">
            ödenen
          </span>
        </span>
      </header>

      <div
        className={cn(
          "min-h-[10rem] flex-1 px-3.5 py-3 transition-opacity",
          loading && "opacity-40"
        )}
      >
        {gunler.length < 2 ? (
          <div className="flex h-32 items-center justify-center text-[13px] text-muted-foreground">
            Bu pencerede yeterli günlük veri yok.
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="h-36 w-full"
              role="img"
              aria-label="Günlük ödenen tahsilat"
            >
              <path
                d={alanPath}
                fill="color-mix(in oklab, var(--chart-1) 18%, transparent)"
              />
              <path
                d={path}
                fill="none"
                stroke="var(--chart-1)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{formatDate(ilkGun)}</span>
              <span className="font-mono tabular-nums">
                zirve {formatCurrency(maxDeger)}
              </span>
              <span>{formatDate(sonGun)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
