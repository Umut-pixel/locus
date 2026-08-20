"use client";

import type { SevkiyatOzet } from "@/hooks/useSevkiyatRaporu";
import { formatNumber } from "@/lib/format";
import { RISK_COLORS, RISK_LABELS, RISK_ORDER } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

interface TeslimatGecikmeDagilimiProps {
  riskDagilimi: SevkiyatOzet["riskDagilimi"];
  loading: boolean;
}

/**
 * Teslimat gecikmesi dağılımı — Donut DEĞİL: risk_durumu bir tutar değil sayım,
 * Donut'un formatCurrency'ye sabitlenmiş merkez/legend'ı burada yanıltıcı
 * olurdu. Tek yatay çubuk (parça-bütün) + sayımlı legend.
 */
export function TeslimatGecikmeDagilimi({
  riskDagilimi,
  loading,
}: TeslimatGecikmeDagilimiProps) {
  const toplam = RISK_ORDER.reduce((a, r) => a + riskDagilimi[r], 0) || 1;

  return (
    <section className="flex min-w-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Teslimat gecikmesi dağılımı
        </h2>
        <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
          {formatNumber(toplam)} müşteri
        </span>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col justify-center gap-4 px-3.5 py-4 transition-opacity",
          loading && "opacity-40"
        )}
      >
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
          {RISK_ORDER.map((r) => {
            const pay = riskDagilimi[r] / toplam;
            if (pay <= 0) return null;
            return (
              <div
                key={r}
                style={{ width: `${pay * 100}%`, backgroundColor: RISK_COLORS[r] }}
                title={`${RISK_LABELS[r]}: ${formatNumber(riskDagilimi[r])}`}
                className="h-full transition-[width] duration-500 ease-out first:rounded-l-full last:rounded-r-full"
              />
            );
          })}
        </div>

        <ul className="flex flex-col gap-2">
          {RISK_ORDER.map((r) => (
            <li key={r} className="flex items-center gap-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: RISK_COLORS[r] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                {RISK_LABELS[r]}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-medium text-foreground tabular-nums">
                {formatNumber(riskDagilimi[r])}
              </span>
              <span className="w-11 shrink-0 text-right font-mono text-[12.5px] text-muted-foreground tabular-nums">
                %{Math.round((riskDagilimi[r] / toplam) * 100)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
