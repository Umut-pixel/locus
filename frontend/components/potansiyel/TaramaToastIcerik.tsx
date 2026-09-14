"use client";

import type { TaramaOzeti, TaramaSatiri } from "@/lib/potansiyel-tarama";

/**
 * Tarama toast'ının gövdesi. `CekimToastIcerik.tsx` ile aynı rol:
 * `description` ReactNode kabul ettiği için `toast.update` ile canlı
 * güncellenebiliyor.
 */

function sureMetni(basladiAt: number, now: number): string {
  const sn = Math.max(0, Math.round((now - basladiAt) / 1000));
  if (sn < 60) return `${sn} sn`;
  const dk = Math.floor(sn / 60);
  const kalan = sn % 60;
  return kalan > 0 ? `${dk} dk ${kalan} sn` : `${dk} dk`;
}

export function TaramaIlerlemesi({
  il,
  planlananIlce,
  basladiAt,
  simdi,
}: {
  il: string;
  planlananIlce: number | null;
  basladiAt: number;
  simdi: number;
}) {
  return (
    <span className="tabular-nums">
      {planlananIlce != null ? `${planlananIlce} ilçe · ` : ""}
      {sureMetni(basladiAt, simdi)} geçti
      <span className="text-muted-foreground/70"> — {il}</span>
    </span>
  );
}

export function TaramaOzetiIcerik({ satir }: { satir: TaramaSatiri }) {
  const ozet: TaramaOzeti = satir.ozet ?? {};
  const yeni = satir.yeniPotansiyelSayisi ?? ozet.newPlaceCount ?? 0;
  const mevcut = ozet.existingPlaceCount ?? 0;
  const ilce = satir.tarananIlceSayisi ?? ozet.markedScanned ?? 0;
  const atlanan = ozet.atlananIlceSayisi ?? 0;
  const hata429 = ozet.nearbyHttp429 ?? 0;

  if (ozet.skipAll) {
    return (
      <span>
        {satir.il}: taranacak ilçe kalmamış (hepsi yakın zamanda tarandı).
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span className="tabular-nums">
        <strong className="font-medium text-foreground">{yeni}</strong> yeni
        potansiyel · {mevcut} mevcut kayıt güncellendi
      </span>
      <span className="tabular-nums text-muted-foreground/80">
        {ilce} ilçe tarandı
        {atlanan > 0 ? ` · ${atlanan} ilçe bu tura sığmadı` : ""}
        {hata429 > 0 ? ` · ${hata429} kota hatası` : ""}
      </span>
    </span>
  );
}
