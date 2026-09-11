"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
} from "lucide-react";

import {
  karneOzeti,
  type Kriter,
  type KriterAnahtari,
  type KriterDurumu,
} from "@/lib/rota/kriter";
import { GsapCollapse } from "@/components/ui/gsap-collapse";
import { cn } from "@/lib/utils";

interface PlanKarnesiProps {
  kriterler: Kriter[];
  /**
   * Satıra tıklanınca hangi kriterin vurgulanacağı; `null` vurguyu kaldırır.
   * Nesne değil ANAHTAR taşınıyor: kriterler her plan değişiminde yeniden
   * hesaplandığı için saklanan bir `suclular` nesnesi bayatlar.
   */
  onVurgula: (anahtar: KriterAnahtari | null) => void;
  /** Şu an vurgulanan kriter — satır seçili görünür. */
  vurgulanan: KriterAnahtari | null;
  className?: string;
}

const DURUM_SINIFI: Record<KriterDurumu, string> = {
  iyi: "text-muted-foreground",
  dikkat: "text-caution",
  sorun: "text-destructive",
};

const DURUM_ETIKETI: Record<KriterDurumu, string> = {
  iyi: "sorun yok",
  dikkat: "dikkat",
  sorun: "sorun",
};

/** Kaynak rozeti — ölçülen sessiz, tahmin ve eksik veri açıkça söyleniyor. */
function KaynakRozeti({ kaynak }: { kaynak: Kriter["kaynak"] }) {
  if (kaynak === "olculen") return null;
  return (
    <span
      className="shrink-0 rounded border border-border/70 px-1 py-px text-[9.5px] tracking-wide text-muted-foreground uppercase"
      title={
        kaynak === "tahmini"
          ? "Vekil bir ölçüyle temsil ediliyor — gerçek değer bu değil."
          : "Bu kriter için veri yok; hesaplanamıyor."
      }
    >
      {kaynak === "tahmini" ? "tahmini" : "veri yok"}
    </span>
  );
}

/**
 * Plan karnesi — haritanın üstünde, "bu plan sahaya çıkar mı".
 *
 * Neden HARİTADA: karar mekânsal. Planlama ekranı haritanın yokluğunu telafi
 * etmek için altı ayrı sayısal vekil (yayılım, bölünmüş bölge, bölge km'si…)
 * üretmişti; tam ekran harita ise araç listesi ve küçük bir çipten ibaretti.
 * Ölçüm, sonucun görüldüğü yerde duruyor artık.
 *
 * Satıra tıklamak `suclular`'ı haritada vurgular: sayıyı okuyup aracı elle
 * aramak yerine sorun doğrudan gösteriliyor.
 */
export function PlanKarnesi({
  kriterler,
  onVurgula,
  vurgulanan,
  className,
}: PlanKarnesiProps) {
  const [acik, setAcik] = useState(true);

  if (kriterler.length === 0) {
    return (
      <div className={cn("px-3 py-2 text-[12px] text-muted-foreground", className)}>
        Henüz dağıtım yok — planlama ekranından yükü araçlara dağıtın.
      </div>
    );
  }

  const ozet = karneOzeti(kriterler);
  const OzetIkon =
    ozet.durum === "sorun"
      ? CircleAlertIcon
      : ozet.durum === "dikkat"
        ? AlertTriangleIcon
        : CheckCircle2Icon;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <button
        type="button"
        onClick={() => setAcik((o) => !o)}
        aria-expanded={acik}
        className="flex h-10 shrink-0 items-center gap-2 px-3 text-left transition-colors hover:bg-accent/30"
      >
        <ClipboardCheckIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Plan karnesi
        </span>
        <span className={cn("flex items-center gap-1 text-[11.5px]", DURUM_SINIFI[ozet.durum])}>
          <OzetIkon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {ozet.sorun > 0
            ? `${ozet.sorun} sorun`
            : ozet.dikkat > 0
              ? `${ozet.dikkat} dikkat`
              : "temiz"}
        </span>
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
        <ul className="flex flex-col">
          {kriterler.map((k) => {
            const vurgulanabilir =
              k.suclular.araclar.length > 0 || k.suclular.duraklar.length > 0;
            const secili = vurgulanan === k.anahtar;
            return (
              <li key={k.anahtar} className="border-b border-border/25 last:border-b-0">
                <KriterSatiri
                  kriter={k}
                  secili={secili}
                  vurgulanabilir={vurgulanabilir}
                  onSec={() => onVurgula(secili ? null : k.anahtar)}
                />
              </li>
            );
          })}
        </ul>
      </GsapCollapse>
    </div>
  );
}

function KriterSatiri({
  kriter,
  secili,
  vurgulanabilir,
  onSec,
}: {
  kriter: Kriter;
  secili: boolean;
  vurgulanabilir: boolean;
  onSec: () => void;
}) {
  const [aciklamaAcik, setAciklamaAcik] = useState(false);

  const govde = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {/*
          Durum yalnız renkle anlatılmıyor: ikon + `sr-only` metin var.
          Modülün geri kalanında bu ayrım yoktu (amber sayı = uyarı).
        */}
        <StatusIkon durum={kriter.durum} />
        <span className="min-w-0 truncate text-[12px] text-foreground">
          {kriter.ad}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <KaynakRozeti kaynak={kriter.kaynak} />
        <span
          className={cn(
            "font-mono text-[11.5px] tabular-nums",
            kriter.durum === "iyi" ? "text-muted-foreground" : DURUM_SINIFI[kriter.durum]
          )}
        >
          {kriter.deger}
        </span>
      </span>
    </>
  );

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          setAciklamaAcik((o) => !o);
          if (vurgulanabilir) onSec();
        }}
        aria-expanded={aciklamaAcik}
        title={
          vurgulanabilir
            ? `${kriter.ad} — ilgili araç ve durakları haritada göster`
            : kriter.ad
        }
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors",
          secili ? "bg-accent/50" : "hover:bg-accent/30"
        )}
      >
        {govde}
      </button>

      {/*
        Açıklama görünür metin, `title` değil: bu cümleler kararın gerekçesi
        ve dokunmatikte/ekran okuyucuda kaybolmamalı.
      */}
      <GsapCollapse open={aciklamaAcik}>
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">
          {kriter.aciklama}
        </p>
      </GsapCollapse>
    </div>
  );
}

function StatusIkon({ durum }: { durum: KriterDurumu }) {
  const Ikon =
    durum === "sorun"
      ? CircleAlertIcon
      : durum === "dikkat"
        ? AlertTriangleIcon
        : CheckCircle2Icon;
  return (
    <>
      <Ikon
        className={cn("size-3.5 shrink-0", DURUM_SINIFI[durum])}
        strokeWidth={2}
        aria-hidden
      />
      <span className="sr-only">{DURUM_ETIKETI[durum]}:</span>
    </>
  );
}
