"use client";

import { STOK_REPORT_ID, type StokOzet } from "@/hooks/useStokRaporu";
import { useRaporTazeligi } from "@/hooks/useMusteriRaporlama";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Stok günlük çekiliyor (5430, 07:40 TR) — bir günü aşarsa envanter bayat. */
const TAZELIK_UYARI_SAAT = 24;
const TAZELIK_KRITIK_SAAT = 48;

interface StokDurumCubuguProps {
  ozet: StokOzet;
  toplamUrun: number;
  loading: boolean;
}

/**
 * Alt durum çubuğu — müşteri raporlamasındaki ile aynı dil. Filtrelenmiş
 * kümeyi özetler; sağda verinin kaç saatlik olduğu, çünkü anlık envanter
 * görüntüsünde tazelik değerin kendisi kadar önemli.
 */
export function StokDurumCubugu({
  ozet,
  toplamUrun,
  loading,
}: StokDurumCubuguProps) {
  const filtreli = ozet.urunAdet !== toplamUrun;

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-x-5 overflow-x-auto border-t border-border bg-muted/25 px-3.5 text-[13.5px] whitespace-nowrap">
      <span className="font-mono font-medium text-foreground tabular-nums">
        {formatNumber(ozet.urunAdet)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          {filtreli ? `/ ${formatNumber(toplamUrun)} ürün` : "ürün"}
        </span>
      </span>

      <Ayirac />

      <span className="font-mono font-medium text-foreground tabular-nums">
        {loading ? "…" : formatCurrency(ozet.toplamBrut)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          stok değeri
        </span>
      </span>

      <Ayirac />

      <span className="font-mono font-medium text-foreground tabular-nums">
        {loading ? "…" : formatNumber(ozet.toplamMiktar)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          adet
        </span>
      </span>

      <Ayirac />

      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          ozet.stoktaYokAdet > 0 ? "text-destructive" : "text-foreground"
        )}
      >
        {loading ? "…" : formatNumber(ozet.stoktaYokAdet)}
        <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">
          stokta yok
        </span>
      </span>

      <div className="ml-auto flex items-center gap-x-5 pl-5">
        <StokTazeligi />
      </div>
    </div>
  );
}

function StokTazeligi() {
  const { saatOnce, loading } = useRaporTazeligi(STOK_REPORT_ID);
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
      title={`Detaylı Stok Raporu (5430) Panorama'dan en son ${metin} çekildi. Bu sayfadaki tüm değerler o anın envanter görüntüsü.`}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          kritik ? "bg-red-400" : uyari ? "bg-amber-400" : "bg-emerald-400"
        )}
        aria-hidden
      />
      <span className="text-[12px] text-muted-foreground">Stok verisi</span>
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
