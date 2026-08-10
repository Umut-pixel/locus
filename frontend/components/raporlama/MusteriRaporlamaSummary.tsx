import type { RaporlamaSummary } from "@/hooks/useMusteriRaporlama";
import { formatCurrency, formatNumber } from "@/lib/format";
import { RISK_COLORS, RISK_ORDER, RISK_SHORT_LABELS } from "@/lib/risk-style";

interface MusteriRaporlamaSummaryProps {
  totalCount: number;
  summary: RaporlamaSummary;
  loading: boolean;
}

/**
 * Alt durum çubuğu — dashboard kartı değil. Filtrelenmiş kümenin tamamını
 * (görünen sayfayı değil) özetler; tek satır. 2026-08-10: ilk yoğun geçişten
 * (44px) sonra "çok dar" geri bildirimiyle ~%20 büyütüldü (~52px).
 */
export function MusteriRaporlamaSummary({
  totalCount,
  summary,
  loading,
}: MusteriRaporlamaSummaryProps) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-x-5 gap-y-1 overflow-x-auto border-t border-border bg-muted/25 px-3.5 text-[13.5px] whitespace-nowrap">
      <span className="font-mono font-medium text-foreground tabular-nums">
        {formatNumber(totalCount)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          müşteri
        </span>
      </span>

      <Ayirac />

      <span className="font-mono font-medium text-foreground tabular-nums">
        {loading ? "…" : formatCurrency(summary.toplamNetCiro)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          net ciro
        </span>
      </span>

      <Ayirac />

      <div className="flex items-center gap-x-4">
        {RISK_ORDER.map((risk) => (
          <span key={risk} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk] }}
              aria-hidden
            />
            <span className="font-mono font-medium text-foreground tabular-nums">
              {loading ? "…" : formatNumber(summary.riskDagilimi[risk])}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {RISK_SHORT_LABELS[risk]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Ayirac() {
  return <span className="h-4 w-px shrink-0 bg-border" aria-hidden />;
}
