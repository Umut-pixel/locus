"use client";

import { useMemo } from "react";

import { Donut, type DonutDilim } from "@/components/stok/Donut";
import type { OdemeTipiDilimi, PlakaDilimi } from "@/hooks/useSevkiyatRaporu";
import { formatCurrency } from "@/lib/format";

interface PlakaOdemeDagilimiProps {
  plakalar: PlakaDilimi[];
  odemeTipleri: OdemeTipiDilimi[];
  loading: boolean;
}

/** Sabit sırayla 5 doğrulanmış kategorik renk + "Diğer" için nötr gri — Donut'un diğer kullanımlarıyla aynı palet. */
const DILIM_RENKLERI = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const DIGER_RENGI = "var(--muted-foreground)";

function capForDonut(
  dilimler: { ad: string; tutar: number }[],
  maxDilim = 5
): DonutDilim[] {
  const sirali = [...dilimler].sort((a, b) => b.tutar - a.tutar);
  const on = sirali.slice(0, maxDilim);
  const kalan = sirali.slice(maxDilim);
  const toplam = sirali.reduce((a, d) => a + d.tutar, 0);
  const digerTutar = kalan.reduce((a, d) => a + d.tutar, 0);

  const renkli: DonutDilim[] = on.map((d, i) => ({
    ad: d.ad,
    deger: d.tutar,
    pay: toplam > 0 ? d.tutar / toplam : 0,
    renk: DILIM_RENKLERI[i]!,
  }));
  if (digerTutar > 0) {
    renkli.push({
      ad: "Diğer",
      deger: digerTutar,
      pay: toplam > 0 ? digerTutar / toplam : 0,
      renk: DIGER_RENGI,
    });
  }
  return renkli;
}

/**
 * Plaka/araç bazlı hacim ve ödeme tipi kırılımı — ikisi de mevcut sync
 * penceresinin satır bazlı sevkiyat verisinden (v_panorama_sevkiyat_raporu_kup_guncel).
 * Ödeme tipi Panorama'nın sevkiyat raporunda geliyor (açık hesap/çek/kredi
 * kartı/peşin/senet/ticari kart/dbs) — keşif sırasında görülen bonus alan.
 */
export function PlakaOdemeDagilimi({
  plakalar,
  odemeTipleri,
  loading,
}: PlakaOdemeDagilimiProps) {
  const plakaDilimler = useMemo(
    () => capForDonut(plakalar.map((p) => ({ ad: p.plaka, tutar: p.toplamTutar }))),
    [plakalar]
  );
  const odemeDilimler = useMemo(() => capForDonut(odemeTipleri), [odemeTipleri]);

  const plakaToplam = plakalar.reduce((a, p) => a + p.toplamTutar, 0);
  const odemeToplam = odemeTipleri.reduce((a, o) => a + o.tutar, 0);

  return (
    <div className="grid border-b border-border lg:grid-cols-2 [&>section]:h-[19rem]">
      <section className="flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0">
        <header className="flex h-11 shrink-0 items-center px-3.5">
          <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            Plaka bazlı hacim
          </h2>
        </header>
        <div className="min-h-0 flex-1 px-3.5 pb-4">
          {plakaDilimler.length === 0 ? (
            <BosDurum metin="Mevcut sync penceresinde plaka verisi yok." />
          ) : (
            <Donut
              dilimler={plakaDilimler}
              merkezEtiket="Toplam"
              merkezDeger={formatCurrency(plakaToplam)}
              loading={loading}
            />
          )}
        </div>
      </section>

      <section className="flex min-w-0 flex-col">
        <header className="flex h-11 shrink-0 items-center px-3.5">
          <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            Ödeme tipi kırılımı
          </h2>
        </header>
        <div className="min-h-0 flex-1 px-3.5 pb-4">
          {odemeDilimler.length === 0 ? (
            <BosDurum metin="Mevcut sync penceresinde ödeme tipi verisi yok." />
          ) : (
            <Donut
              dilimler={odemeDilimler}
              merkezEtiket="Toplam"
              merkezDeger={formatCurrency(odemeToplam)}
              loading={loading}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function BosDurum({ metin }: { metin: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
      {metin}
    </div>
  );
}
