"use client";

import { useMemo } from "react";

import {
  capForPie,
  stokDagilimi,
  type StokBoyut,
  type StokSatiri,
} from "@/hooks/useStokRaporu";
import { Donut, type DonutDilim } from "@/components/stok/Donut";
import { SegmentedSwitch } from "@/components/ui/segmented-switch";
import { formatCurrency } from "@/lib/format";

interface StokDagilimProps {
  satirlar: StokSatiri[];
  boyut: StokBoyut;
  onBoyutChange: (boyut: StokBoyut) => void;
  loading: boolean;
  onDilimSec: (ad: string) => void;
  seciliDilim: string | null;
}

/** Sabit sırayla 5 doğrulanmış kategorik renk + "Diğer" için nötr gri. */
const DILIM_RENKLERI = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const DIGER_RENGI = "var(--muted-foreground)";

/**
 * Donut — parça-bütün hikayesi (marka/kategori toplam stok değeri içindeki
 * payı). En fazla 5 dilim + "Diğer": doğrulanmış kategorik palet 5 renk
 * taşıyor, daha fazla dilim aynı havuzu paylaşıp CVD ayrımını bozardı.
 * "Diğer" tıklanamaz — tek bir filtre değerine karşılık gelmiyor.
 */
export function StokDagilim({
  satirlar,
  boyut,
  onBoyutChange,
  loading,
  onDilimSec,
  seciliDilim,
}: StokDagilimProps) {
  const dilimler = useMemo(() => stokDagilimi(satirlar, boyut), [satirlar, boyut]);
  const donutDilimler = useMemo(() => capForPie(dilimler, 5), [dilimler]);
  const toplamBrut = useMemo(
    () => dilimler.reduce((a, d) => a + d.brutTutar, 0),
    [dilimler]
  );

  const renkli: DonutDilim[] = donutDilimler.map((d, i) => ({
    ad: d.ad,
    deger: d.brutTutar,
    pay: d.pay,
    renk: d.ad === "Diğer" ? DIGER_RENGI : DILIM_RENKLERI[i]!,
  }));

  return (
    <section className="flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Stok değeri dağılımı
        </h2>
        <SegmentedSwitch
          value={boyut}
          onChange={onBoyutChange}
          ariaLabel="Dağılım kırılımı"
          options={
            [
              { value: "marka", label: "Marka" },
              { value: "kategori", label: "Kategori" },
            ] as const
          }
        />
      </header>

      <div className="min-h-0 flex-1 px-3.5 py-3">
        {donutDilimler.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            Gösterilecek {boyut} yok.
          </p>
        ) : (
          <Donut
            dilimler={renkli}
            merkezEtiket="Toplam stok değeri"
            merkezDeger={formatCurrency(toplamBrut)}
            seciliAd={seciliDilim}
            onDilimSec={onDilimSec}
            loading={loading}
          />
        )}
      </div>
    </section>
  );
}
