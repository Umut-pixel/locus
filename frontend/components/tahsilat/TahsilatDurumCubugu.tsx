"use client";

import {
  TAHSILAT_REPORT_ID,
  type TahsilatOzet,
} from "@/hooks/useTahsilatRaporu";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const TAZELIK_UYARI_SAAT = 24;
const TAZELIK_KRITIK_SAAT = 48;

interface TahsilatDurumCubuguProps {
  ozet: TahsilatOzet;
  toplamBelge: number;
  loading: boolean;
}

export function TahsilatDurumCubugu({
  ozet,
  toplamBelge,
  loading,
}: TahsilatDurumCubuguProps) {
  const filtreli = ozet.belgeAdet !== toplamBelge;

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-x-5 overflow-x-auto border-t border-border bg-muted/25 px-3.5 text-[13.5px] whitespace-nowrap">
      <span className="font-mono font-medium text-foreground tabular-nums">
        {formatNumber(ozet.belgeAdet)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          {filtreli ? `/ ${formatNumber(toplamBelge)} belge` : "belge"}
        </span>
      </span>

      <Ayirac />

      <span className="font-mono font-medium text-foreground tabular-nums">
        {loading ? "…" : formatCurrency(ozet.donemTahsilat)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          ödenen
        </span>
      </span>

      <Ayirac />

      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          ozet.odenmemisAdet > 0 ? "text-caution" : "text-foreground"
        )}
      >
        {loading ? "…" : formatNumber(ozet.odenmemisAdet)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          ödenmedi
        </span>
      </span>

      <div className="ml-auto flex items-center gap-x-5 pl-5">
        <TahsilatTazeligi />
      </div>
    </div>
  );
}

function TahsilatTazeligi() {
  const { saatOnce, loading } = useRaporTazeligi(TAHSILAT_REPORT_ID);
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
      title={`Tahsilat Raporu (5230) Panorama'dan en son ${metin} çekildi. Nakit girişi; fatura cirosu değil.`}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          kritik ? "bg-red-400" : uyari ? "bg-amber-400" : "bg-emerald-400"
        )}
        aria-hidden
      />
      <span className="text-[12px] text-muted-foreground">Tahsilat verisi</span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          kritik ? "text-red-400" : uyari ? "text-amber-400" : "text-foreground"
        )}
      >
        {metin}
      </span>
    </span>
  );
}

function Ayirac() {
  return <span className="h-4 w-px shrink-0 bg-border" aria-hidden />;
}
