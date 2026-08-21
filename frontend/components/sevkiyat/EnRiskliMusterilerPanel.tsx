"use client";

import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { RiskliMusteriSatiri } from "@/hooks/useSevkiyatRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface EnRiskliMusterilerPanelProps {
  satirlar: RiskliMusteriSatiri[];
  loading: boolean;
  className?: string;
  /** Başlığın sağına gömülen kontrol (bekleyen ↔ riskli geçişi). */
  headerExtra?: React.ReactNode;
}

/** En uzun süredir teslimat almayan 20 müşteri — StoktaYokPanel.tsx'in ranked-list deseniyle aynı. */
export function EnRiskliMusterilerPanel({
  satirlar,
  loading,
  className,
  headerExtra,
}: EnRiskliMusterilerPanelProps) {
  const bos = satirlar.length === 0;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <section
      ref={wrapperRef}
      className={cn(
        "relative flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0",
        className
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <AlertTriangleIcon
            className={cn("size-3.5 shrink-0", !bos && "text-destructive")}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">En riskli müşteriler</span>
        </h2>
        {!bos ? (
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-destructive tabular-nums">
            {formatNumber(satirlar.length)}
          </span>
        ) : null}
        {headerExtra ? <div className="ml-auto shrink-0">{headerExtra}</div> : null}
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
              90+ gün teslimat almayan müşteri yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map((s) => (
              <li
                key={s.musteriKodu}
                className="flex min-w-0 items-center gap-3 px-3.5 py-2"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-foreground">{s.unvan}</span>
                  <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                    {s.musteriKodu}
                    {s.rutKod ? ` · ${s.rutKod}` : ""}
                    {s.sehir ? ` · ${s.sehir}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-[12.5px] font-medium text-destructive tabular-nums">
                    {s.gecenGun != null ? `${formatNumber(s.gecenGun)} gün` : "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(s.sonTeslimatTarihi)}
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
