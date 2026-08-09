import type { RaporlamaSummary } from "@/hooks/useMusteriRaporlama";
import { formatCurrency, formatNumber } from "@/lib/format";
import { RISK_COLORS, RISK_ORDER, RISK_SHORT_LABELS } from "@/lib/risk-style";

interface MusteriRaporlamaSummaryProps {
  totalCount: number;
  summary: RaporlamaSummary;
  loading: boolean;
}

export function MusteriRaporlamaSummary({
  totalCount,
  summary,
  loading,
}: MusteriRaporlamaSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[12px] sm:px-6">
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">{formatNumber(totalCount)}</span>{" "}
        müşteri görüntüleniyor
      </span>
      <span className="text-muted-foreground">
        Toplam net ciro:{" "}
        <span className="font-mono font-medium text-foreground">
          {loading ? "…" : formatCurrency(summary.toplamNetCiro)}
        </span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {RISK_ORDER.map((risk) => (
          <span key={risk} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk] }}
              aria-hidden
            />
            {RISK_SHORT_LABELS[risk]}{" "}
            <span className="font-mono tabular-nums text-foreground">
              {loading ? "…" : formatNumber(summary.riskDagilimi[risk])}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
