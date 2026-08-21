"use client";

import { CheckCircle2Icon, ClipboardListIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { BekleyenSiparisSatiri } from "@/hooks/useSevkiyatRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BekleyenSiparislerPanelProps {
  satirlar: BekleyenSiparisSatiri[];
  loading: boolean;
  className?: string;
  /** Başlığın sağına gömülen kontrol (bekleyen ↔ riskli geçişi). */
  headerExtra?: React.ReactNode;
}

const DURUM_ETIKET: Record<BekleyenSiparisSatiri["durum"], string> = {
  bekleyen: "Bekliyor",
  irsaliyeli: "İrsaliyeli",
};

/**
 * Sipariş Durum Raporu'ndan (5140) — henüz faturalaştırılmamış siparişler.
 * "Bekleyen Sipariş" (işlenmedi) ve "İrsaliyeleştirildi" (sevk edildi,
 * faturalanmadı) durumları; "Faturalaştırıldı" (çoğunluk, ~8400 satır)
 * hook seviyesinde zaten filtreleniyor. StoktaYokPanel.tsx'in ranked-list
 * deseniyle aynı — 3'lü grid'de orta sütun, bkz. page.tsx'teki border notu.
 */
export function BekleyenSiparislerPanel({
  satirlar,
  loading,
  className,
  headerExtra,
}: BekleyenSiparislerPanelProps) {
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
          <ClipboardListIcon
            className={cn("size-3.5 shrink-0", !bos && "text-amber-400")}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">Bekleyen siparişler</span>
        </h2>
        {!bos ? (
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-amber-400 tabular-nums">
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
              Bekleyen veya faturalanmamış sipariş yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map((s) => (
              <li key={s.belgeKod} className="flex min-w-0 items-center gap-3 px-3.5 py-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    s.durum === "bekleyen" ? "bg-amber-400" : "bg-sky-400"
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-foreground">
                    {s.musteriAd ?? s.musteriKod}
                  </span>
                  <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                    #{s.belgeKod} · {s.kalemSayisi} kalem
                    {s.temsilci ? ` · ${s.temsilci}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
                    {formatCurrency(s.toplamTutar)}
                  </span>
                  <span
                    className={cn(
                      "text-[11px]",
                      s.durum === "bekleyen" ? "text-amber-400" : "text-sky-400"
                    )}
                  >
                    {DURUM_ETIKET[s.durum]}
                    {s.gecenGun != null ? ` · ${s.gecenGun} gün` : ""}
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
