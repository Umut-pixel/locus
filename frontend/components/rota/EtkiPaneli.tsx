"use client";

import { ArrowRightIcon } from "lucide-react";

import type { PlanMetrigi } from "@/lib/rota/planla";
import { YAYILIM_UYARI_KM } from "@/lib/rota/operasyon";
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
  /**
   * Şeridin sağ ucuna eklenen üçüncü bölme — "Haritayı aç" burada.
   * Harita eskiden kendi başına ayrı bir kart olarak sol sütundaydı; bu
   * şerit zaten araçlar bölümünün hemen üstünde durduğu için "araçlar
   * sekmesi üzerindeki kısım" ile birleşmesi buraya taşınmasıyla oldu.
   */
  sag?: React.ReactNode;
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
export function EtkiPaneli({ mevcut, secenekler, loading, sag }: EtkiPaneliProps) {
  return (
    <div
      className={cn(
        // Kenarlık sarmalayıcı kartta; `gap-px` + `bg-border` bölmeleri ayırır.
        "flex flex-wrap items-stretch gap-px bg-border transition-opacity",
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
        {/*
          Bölge bütünlüğü: aynı ilçenin iki araca dağılması sahada iki kez
          aynı yere gitmek demek. 0 hedef.
        */}
        <Olcu
          etiket="Bölünmüş bölge"
          deger={formatNumber(mevcut.bolunmusBolge)}
          alt={
            mevcut.bolunmusBolge > 0
              ? "aynı ilçe iki araçta"
              : `araç başına ${mevcut.aracBasinaBolge.toFixed(1)} bölge`
          }
          vurgu={mevcut.bolunmusBolge > 0}
        />
        {/*
          Bir araçtaki en yakın ve en uzak durağın mesafe farkı. "Aydın (4 km)
          + İstanbul (325 km)" vakasının tek sayılık göstergesi.
        */}
        <Olcu
          etiket="Max yayılım"
          deger={`${formatNumber(Math.round(mevcut.maxYayilimKm))} km`}
          alt="bir araçtaki en yakın-en uzak farkı"
          vurgu={mevcut.maxYayilimKm > YAYILIM_UYARI_KM}
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
          {secenekler.map((s) => {
            const ozet =
              `${formatNumber(s.metrik.yerlesenDurak)} durak, ` +
              `${yuzde(s.metrik.ortDoluluk)} doluluk, ` +
              `${formatNumber(Math.round(s.metrik.toplamKm))} km, ` +
              `${formatNumber(s.metrik.aracSayisi)} araç, ` +
              `${formatNumber(s.metrik.bolunmusBolge)} bölünmüş bölge, ` +
              `max yayılım ${formatNumber(Math.round(s.metrik.maxYayilimKm))} km`;
            return (
              <button
                key={s.etiket}
                type="button"
                onClick={s.onSec}
                /*
                  `disabled` DEĞİL: seçili seçeneği devre dışı bırakmak onu sekme
                  sırasından ve ekran okuyucudan düşürüyordu — yani hangi
                  stratejinin yürürlükte olduğu klavyeyle anlaşılamıyordu.
                  Modülün geri kalanı zaten `aria-pressed` kullanıyor.
                */
                aria-pressed={s.secili}
                aria-label={`${s.etiket} stratejisi — ${ozet}`}
                title={`${s.etiket}: ${ozet}`}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11.5px] transition-colors",
                  s.secili
                    ? "border-foreground/30 bg-accent/50 text-foreground"
                    : "border-border/70 text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{s.etiket}</span>
                <span className="tabular-nums opacity-70">
                  {yuzde(s.metrik.ortDoluluk)} ·{" "}
                  {formatNumber(Math.round(s.metrik.toplamKm))} km
                </span>
                {/*
                  Bölünmüş bölge sahada aynı ilçeye iki kez gitmek demek —
                  yalnız tooltip'te kalmamalı, seçim bunun üzerinden yapılıyor.
                */}
                {s.metrik.bolunmusBolge > 0 ? (
                  <span className="tabular-nums text-caution">
                    · {formatNumber(s.metrik.bolunmusBolge)} bölünmüş
                  </span>
                ) : null}
                {!s.secili ? (
                  <ArrowRightIcon className="size-3" strokeWidth={2} aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {sag ? (
        <div className="flex shrink-0 items-center bg-background">{sag}</div>
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
          vurgu ? "text-caution" : "text-foreground"
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
