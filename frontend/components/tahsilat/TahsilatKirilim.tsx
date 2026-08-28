"use client";

import { useMemo } from "react";

import { Donut, type DonutDilim } from "@/components/stok/Donut";
import type { TahsilatDilimi } from "@/hooks/useTahsilatRaporu";
import { formatCurrency } from "@/lib/format";

interface TahsilatKirilimProps {
  turDagilimi: TahsilatDilimi[];
  temsilciDagilimi: TahsilatDilimi[];
  loading: boolean;
}

const DILIM_RENKLERI = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const DIGER_RENGI = "var(--muted-foreground)";

function capForDonut(dilimler: TahsilatDilimi[], maxDilim = 5): DonutDilim[] {
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

export function TahsilatKirilim({
  turDagilimi,
  temsilciDagilimi,
  loading,
}: TahsilatKirilimProps) {
  const turDilimler = useMemo(() => capForDonut(turDagilimi), [turDagilimi]);
  const temsilciDilimler = useMemo(
    () => capForDonut(temsilciDagilimi),
    [temsilciDagilimi]
  );
  const turToplam = turDagilimi.reduce((a, d) => a + d.tutar, 0);
  const temsilciToplam = temsilciDagilimi.reduce((a, d) => a + d.tutar, 0);

  return (
    <div className="grid border-b border-border lg:grid-cols-2 [&>section]:h-[19rem]">
      <section className="flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0">
        <header className="flex h-11 shrink-0 items-center px-3.5">
          <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            Tür kırılımı
          </h2>
        </header>
        <div className="min-h-0 flex-1 px-3.5 pb-4">
          <Donut
            dilimler={turDilimler}
            merkezEtiket="Ödenen"
            merkezDeger={formatCurrency(turToplam)}
            loading={loading}
          />
        </div>
      </section>
      <section className="flex min-w-0 flex-col">
        <header className="flex h-11 shrink-0 items-center px-3.5">
          <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            Temsilci kırılımı
          </h2>
        </header>
        <div className="min-h-0 flex-1 px-3.5 pb-4">
          <Donut
            dilimler={temsilciDilimler}
            merkezEtiket="Ödenen"
            merkezDeger={formatCurrency(temsilciToplam)}
            loading={loading}
          />
        </div>
      </section>
    </div>
  );
}
