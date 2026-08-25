"use client";

import { CheckCircle2Icon, UsersIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { TopBorcluSatiri } from "@/hooks/useFinansalRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency } from "@/lib/format";
import { borcOnemli } from "@/lib/risk-mode";
import { cn } from "@/lib/utils";

interface TopBorclularPanelProps {
  satirlar: TopBorcluSatiri[];
  loading: boolean;
}

/** En yüksek açık bakiyeli 20 müşteri — ranked-list deseni (SktYaklasanPanel ile aynı). */
export function TopBorclularPanel({ satirlar, loading }: TopBorclularPanelProps) {
  const bos = satirlar.length === 0;

  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <section ref={wrapperRef} className="relative flex min-w-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <UsersIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          En yüksek açık bakiye
        </h2>
        {!bos ? (
          <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
            İlk {satirlar.length}
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
              Açık bakiyesi olan müşteri yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map((s, i) => (
              <li
                key={s.musteriKodu}
                className="flex min-w-0 items-center gap-3 px-3.5 py-2"
              >
                <span className="w-4 shrink-0 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    borcOnemli(s.yasRiskliTutar) ? "bg-destructive" : "bg-muted-foreground/60"
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-foreground">{s.unvan}</span>
                  <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                    {s.musteriKodu}
                    {s.sehir ? ` · ${s.sehir}${s.ilce ? "/" + s.ilce : ""}` : ""}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[12.5px] tabular-nums",
                    borcOnemli(s.yasRiskliTutar) ? "text-destructive" : "text-foreground"
                  )}
                  title={
                    borcOnemli(s.yasRiskliTutar)
                      ? `${formatCurrency(s.yasRiskliTutar)} riskli (56+ gün)`
                      : "Açık Bakiye"
                  }
                >
                  {formatCurrency(s.yasToplam)}
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
