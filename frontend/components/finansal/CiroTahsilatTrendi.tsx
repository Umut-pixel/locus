"use client";

import { useMemo } from "react";

import type { CiroGunu } from "@/hooks/useFinansalRaporu";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CiroTahsilatTrendiProps {
  gunler: CiroGunu[];
  loading: boolean;
}

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_Y = 12;

/**
 * Günlük net ciro trendi — düz SVG polyline (Donut.tsx'teki gibi: uygulamada
 * grafik kütüphanesi yok, tek çizgi için bağımlılık ağacı büyütmeye değmedi).
 * Eksen bugünden geriye sabit bir pencere (bkz. CIRO_TREND_GUN_SAYISI) — veri
 * boşluğu (sync durması) grafikte boşluk olarak görünür, gizlenmez.
 */
export function CiroTahsilatTrendi({ gunler, loading }: CiroTahsilatTrendiProps) {
  const { path, alanPath, noktalar, maxDeger, toplam } = useMemo(() => {
    if (gunler.length === 0) {
      return { path: "", alanPath: "", noktalar: [], maxDeger: 0, toplam: 0 };
    }
    const max = Math.max(...gunler.map((g) => g.netCiro), 1);
    const toplam = gunler.reduce((a, g) => a + g.netCiro, 0);
    const usableH = VIEW_H - PAD_Y * 2;
    const stepX = gunler.length > 1 ? VIEW_W / (gunler.length - 1) : 0;

    const noktalar = gunler.map((g, i) => {
      const x = gunler.length > 1 ? i * stepX : VIEW_W / 2;
      const y = PAD_Y + usableH - (g.netCiro / max) * usableH;
      return { x, y, gun: g };
    });

    const path = noktalar
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const alanPath =
      noktalar.length > 0
        ? `${path} L${noktalar[noktalar.length - 1]!.x.toFixed(1)},${VIEW_H} L${noktalar[0]!.x.toFixed(1)},${VIEW_H} Z`
        : "";

    return { path, alanPath, noktalar, maxDeger: max, toplam };
  }, [gunler]);

  const ilkGun = gunler[0]?.tarih ?? null;
  const sonGun = gunler[gunler.length - 1]?.tarih ?? null;

  return (
    <section className="flex min-w-0 flex-col border-b border-border">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Ciro ve tahsilat trendi
        </h2>
        <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
          {formatCurrency(toplam)}
          <span className="ml-1.5 font-sans text-[11.5px] font-normal text-muted-foreground">
            toplam
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
              preserveAspectRatio="none"
              className="h-32 w-full"
              role="img"
              aria-label={`Günlük net ciro trendi, toplam ${formatCurrency(toplam)}`}
            >
              <defs>
                <linearGradient id="ciroTrendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={alanPath} fill="url(#ciroTrendGradient)" stroke="none" />
              <path
                d={path}
                fill="none"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {noktalar.map((p) => (
                <circle
                  key={p.gun.tarih}
                  cx={p.x}
                  cy={p.y}
                  r={2.2}
                  fill="var(--chart-2)"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>
                    {formatDate(p.gun.tarih)}: {formatCurrency(p.gun.netCiro)}
                  </title>
                </circle>
              ))}
            </svg>
            <div className="mt-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span>{formatDate(ilkGun)}</span>
              <span title="Pencere içindeki en yüksek günlük ciro">
                Zirve {formatCurrency(maxDeger)}
              </span>
              <span>{formatDate(sonGun)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
