"use client";

import {
  YASLANDIRMA_REPORT_ID,
  useRaporTazeligi,
  type RaporlamaSummary,
} from "@/hooks/useMusteriRaporlama";
import { formatCurrency, formatNumber } from "@/lib/format";
import { riskShortLabelsForMode, type RiskMetricMode } from "@/lib/risk-mode";
import { RISK_COLORS, RISK_ORDER } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

interface MusteriRaporlamaSummaryProps {
  totalCount: number;
  summary: RaporlamaSummary;
  loading: boolean;
  riskMode: RiskMetricMode;
}

/** 24 saati aşan borç verisi amber, 48 saati aşan kırmızı — n8n'de 5530 cron'u yok. */
const TAZELIK_UYARI_SAAT = 24;
const TAZELIK_KRITIK_SAAT = 48;

/**
 * Açık Bakiye ve Borç riski tamamen ST Yaşlandırma'ya (5530) dayanıyor ve bu
 * rapor otomatik çekilmiyor. Verinin kaç saatlik olduğunu göstermezsek bayat
 * borçla karar alınıyor ve ekranda hiçbir iz kalmıyor.
 */
function BorcTazeligi() {
  const { saatOnce, loading } = useRaporTazeligi(YASLANDIRMA_REPORT_ID);

  if (loading || saatOnce == null) return null;

  const kritik = saatOnce >= TAZELIK_KRITIK_SAAT;
  const uyari = saatOnce >= TAZELIK_UYARI_SAAT;
  const metin =
    saatOnce < 1
      ? "az önce"
      : saatOnce < 24
        ? `${saatOnce} saat önce`
        : `${Math.floor(saatOnce / 24)} gün önce`;

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      title={`ST Yaşlandırma (5530) Panorama'dan en son ${metin} çekildi. Açık bakiye ve borç riski bu veriye dayanıyor.`}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          kritik
            ? "bg-red-400"
            : uyari
              ? "bg-amber-400"
              : "bg-emerald-400"
        )}
        aria-hidden
      />
      <span className="text-[12px] text-muted-foreground">Borç verisi</span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          kritik
            ? "text-red-400"
            : uyari
              ? "text-amber-400"
              : "text-foreground"
        )}
      >
        {metin}
      </span>
    </span>
  );
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
  riskMode,
}: MusteriRaporlamaSummaryProps) {
  const riskLabels = riskShortLabelsForMode(riskMode);
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
              {riskLabels[risk]}
            </span>
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-x-5 pl-5">
        <BorcTazeligi />
      </div>
    </div>
  );
}

function Ayirac() {
  return <span className="h-4 w-px shrink-0 bg-border" aria-hidden />;
}
