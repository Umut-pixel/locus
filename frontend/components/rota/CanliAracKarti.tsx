"use client";

/**
 * Canlı araçlar kartı — haritanın üstünde duran, katlanabilir filo paneli.
 *
 * Neden HARİTADA ve neden kart: araçlar haritaya konmuştu ama bulunamıyordu.
 * 2026-09-14'te ölçüldü — 8 araçtan 4'ü deponun dibinde üst üste, 3'ü kadrajın
 * tamamen dışında. Kamera rota planına göre kurulduğu için filonun bir kısmı
 * hep dışarıda kalıyor; imleci büyütmek bu sorunu çözmüyor.
 *
 * Kabuk `PlanKarnesi` ile aynı: başlık düğmesi (ikon + harf aralıklı büyük
 * başlık + durum çipi + chevron), `GsapCollapse` gövde. İki panel yan yana
 * durduğunda aynı dili konuşsunlar.
 *
 * Satıra tıklamak haritayı o araca uçuruyor — `PlanKarnesi`'nde satıra
 * tıklamanın suçluları haritada vurgulamasıyla aynı fikir: sayıyı okuyup
 * aracı elle aramak yerine doğrudan göster.
 */

import { useState } from "react";
import { ChevronDownIcon, SatelliteDishIcon } from "lucide-react";

import { CanliAracListesi } from "@/components/rota/CanliAracListesi";
import { GsapCollapse } from "@/components/ui/gsap-collapse";
import type { CanliAracKonumu } from "@/lib/rota/canli-konum";
import { cn } from "@/lib/utils";

interface CanliAracKartiProps {
  konumlar: CanliAracKonumu[];
  yukleniyor: boolean;
  onOdaklan: (konum: CanliAracKonumu) => void;
  odakliNode?: string | null;
  /** Varsayılan açık — panel dar bir yerdeyse kapalı başlatmak için. */
  varsayilanAcik?: boolean;
  className?: string;
}

export function CanliAracKarti({
  konumlar,
  yukleniyor,
  onOdaklan,
  odakliNode,
  varsayilanAcik = true,
  className,
}: CanliAracKartiProps) {
  const [acik, setAcik] = useState(varsayilanAcik);

  const yolda = konumlar.filter((k) => k.hareket && !k.bayat).length;
  const bayat = konumlar.filter((k) => k.bayat).length;

  /*
   * Çip önceliği: bayat > yolda > park. Bayat en önemlisi çünkü "araç orada"
   * sanılmasına yol açan tek durum o — sayı değil, güven sorunu.
   */
  const cip = yukleniyor
    ? { metin: "yükleniyor…", sinif: "text-muted-foreground" }
    : konumlar.length === 0
      ? { metin: "veri yok", sinif: "text-caution" }
      : bayat > 0
        ? { metin: `${bayat} bayat`, sinif: "text-caution" }
        : yolda > 0
          ? { metin: `${yolda} yolda`, sinif: "text-foreground" }
          : { metin: "hepsi park", sinif: "text-muted-foreground" };

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <button
        type="button"
        onClick={() => setAcik((o) => !o)}
        aria-expanded={acik}
        className="flex h-10 shrink-0 items-center gap-2 px-3 text-left transition-colors hover:bg-accent/30"
      >
        <SatelliteDishIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Canlı araçlar
        </span>
        {konumlar.length > 0 ? (
          <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
            {konumlar.length}
          </span>
        ) : null}
        <span className={cn("text-[11.5px]", cip.sinif)}>{cip.metin}</span>
        <span className="min-w-0 flex-1" />
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            acik && "rotate-180"
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>

      <GsapCollapse open={acik} className="border-t border-border/40">
        {/*
          Uzun filoda kart ekranı yemesin — liste kendi içinde kayıyor.
          8 araçta devreye girmiyor, ileride filo büyürse diye.
        */}
        <div className="max-h-[42vh] overflow-y-auto">
          <CanliAracListesi
            konumlar={konumlar}
            yukleniyor={yukleniyor}
            onOdaklan={onOdaklan}
            odakliNode={odakliNode}
          />
        </div>
      </GsapCollapse>
    </div>
  );
}
