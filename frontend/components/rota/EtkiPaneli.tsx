"use client";

import { ArrowRightIcon } from "lucide-react";

import type { PlanMetrigi } from "@/lib/rota/planla";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface EtkiSecenegi {
  etiket: string;
  metrik: PlanMetrigi;
  secili: boolean;
  onSec: () => void;
}

interface EtkiPaneliProps {
  /** Şu an yürürlükte olan planın ölçümü. */
  mevcut: PlanMetrigi;
  /** Karşılaştırılan alternatifler (ilki genelde mevcut olanla aynı). */
  secenekler: EtkiSecenegi[];
  loading: boolean;
}

function yuzde(n: number): string {
  return `%${Math.round(n)}`;
}

/**
 * Tercihlerin ölçülen etkisi.
 *
 * Tek sayı yerine karşılaştırma gösterilir: "coğrafi dağıtımda güzergâh 412 km
 * ama doluluk %64, doluluk stratejisinde 588 km ve %78" gibi. Hiçbiri
 * Google çağrısı yapmaz — mesafe kuş uçuşu, doluluk zaten yerel hesap.
 */
export function EtkiPaneli({ mevcut, secenekler, loading }: EtkiPaneliProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-stretch gap-px border-b border-border bg-border transition-opacity",
        loading && "opacity-40"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 bg-background px-3.5 py-2">
        <Olcu
          etiket="Yerleşen"
          deger={`${formatNumber(mevcut.yerlesenDurak)} durak`}
          alt={
            mevcut.havuzdaKalan > 0
              ? `${formatNumber(mevcut.havuzdaKalan)} havuzda`
              : "havuz boş"
          }
          vurgu={mevcut.havuzdaKalan > 0}
        />
        <Olcu
          etiket="Ort. doluluk"
          deger={yuzde(mevcut.ortDoluluk)}
          alt="bağlayıcı kısıt bazında"
        />
        <Olcu
          etiket="Araç"
          deger={formatNumber(mevcut.aracSayisi)}
          alt="yük verilen"
        />
        <Olcu
          etiket="Güzergâh"
          deger={`${formatNumber(Math.round(mevcut.toplamKm))} km`}
          alt="kuş uçuşu, depoya dönüşle"
        />
        {mevcut.asimVar ? (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
            kapasite aşımı
          </span>
        ) : null}
      </div>

      {secenekler.length > 1 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 bg-background px-3.5 py-2">
          <span className="shrink-0 text-[11.5px] text-muted-foreground">
            Alternatif
          </span>
          {secenekler.map((s) => (
            <button
              key={s.etiket}
              type="button"
              onClick={s.onSec}
              disabled={s.secili}
              title={
                `${s.etiket}: ${formatNumber(s.metrik.yerlesenDurak)} durak, ` +
                `${yuzde(s.metrik.ortDoluluk)} doluluk, ` +
                `${formatNumber(Math.round(s.metrik.toplamKm))} km, ` +
                `${formatNumber(s.metrik.aracSayisi)} araç`
              }
              className={cn(
                "flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11.5px] transition-colors",
                s.secili
                  ? "cursor-default border-foreground/30 bg-accent/50 text-foreground"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{s.etiket}</span>
              <span className="tabular-nums opacity-70">
                {yuzde(s.metrik.ortDoluluk)} ·{" "}
                {formatNumber(Math.round(s.metrik.toplamKm))} km
              </span>
              {!s.secili ? (
                <ArrowRightIcon className="size-3" strokeWidth={2} aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Olcu({
  etiket,
  deger,
  alt,
  vurgu = false,
}: {
  etiket: string;
  deger: string;
  alt: string;
  vurgu?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[11.5px] text-muted-foreground">
        {etiket}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[12.5px] font-medium tabular-nums",
          vurgu ? "text-amber-400" : "text-foreground"
        )}
      >
        {deger}
      </span>
      <span className="min-w-0 truncate text-[11px] text-muted-foreground opacity-70">
        {alt}
      </span>
    </div>
  );
}
