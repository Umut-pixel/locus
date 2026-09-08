"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangleIcon, ChevronRightIcon, MapIcon } from "lucide-react";

import { MusteriAdIlce } from "@/components/sevkiyat/MusteriAdIlce";
import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import type { Bolge } from "@/lib/rota/bolge";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BolgeOzetiProps {
  bolgeler: Bolge[];
  /** musteriKodu → aracAd. Plana girmemiş durak haritada olmaz. */
  durakAraci: Map<string, string>;
  loading: boolean;
}

interface Satir {
  bolge: Bolge;
  /** Bu bölgeyi taşıyan araçlar. Birden fazlaysa bölge bölünmüş. */
  araclar: string[];
  atanmamis: number;
}

/**
 * Bölge → yük → araç tablosu, satırları açılabilir.
 *
 * Araç kartları "bu araçta ne var" sorusunu cevaplıyor; buradaki soru tersi:
 * "bu bölgeye kim gidiyor, bölündü mü". Bölünmüş bölge sahada aynı ilçeye iki
 * kez gitmek demek — ekranda görünmezse fark edilmiyor.
 *
 * Satır açılınca bölgedeki müşteriler tek tek görünüyor: kim, ne kadar yük,
 * hangi araçta. Kapalıyken yalnız toplam vardı; "bu 245 kg kimin" sorusu ancak
 * araç kartları taranarak cevaplanabiliyordu.
 */
export function BolgeOzeti({ bolgeler, durakAraci, loading }: BolgeOzetiProps) {
  /** Aynı anda tek bölge açık — panel dar, birden fazlası listeyi boğuyor. */
  const [acikKod, setAcikKod] = useState<string | null>(null);

  const satirlar = useMemo<Satir[]>(() => {
    return bolgeler
      .map((bolge) => {
        const araclar = new Set<string>();
        let atanmamis = 0;
        for (const d of bolge.duraklar) {
          const arac = durakAraci.get(d.musteriKodu);
          if (arac) araclar.add(arac);
          else atanmamis += 1;
        }
        return { bolge, araclar: [...araclar], atanmamis };
      })
      // Uzak bölgeler üstte: planlamada ilk karar verilmesi gerekenler onlar.
      .sort((a, b) => b.bolge.depoyaKm - a.bolge.depoyaKm);
  }, [bolgeler, durakAraci]);

  const bolunmus = satirlar.filter((s) => s.araclar.length > 1).length;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <section
      ref={wrapperRef}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border"
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <MapIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="truncate">Bölgeler</span>
        </h2>
        {bolunmus > 0 ? (
          <span
            className="flex shrink-0 cursor-help items-center gap-1 text-[11.5px] font-medium text-amber-600 dark:text-amber-400"
            title="Aynı bölgeye birden fazla araç gidiyor — sahada aynı ilçeye iki kez gitmek demek."
          >
            <AlertTriangleIcon className="size-3" strokeWidth={2} aria-hidden />
            {formatNumber(bolunmus)} bölünmüş
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums">
            {formatNumber(satirlar.length)}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {satirlar.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">
            {loading ? "Bölgeler hesaplanıyor…" : "Bekleyen yük yok."}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map(({ bolge, araclar, atanmamis }) => {
              const acik = acikKod === bolge.kod;
              return (
                <Fragment key={bolge.kod}>
                  <li>
                    <button
                      type="button"
                      onClick={() => setAcikKod(acik ? null : bolge.kod)}
                      aria-expanded={acik}
                      className={cn(
                        "flex w-full min-w-0 flex-col gap-1 px-3.5 py-2 text-left transition-colors",
                        acik ? "bg-muted/40" : "hover:bg-muted/30"
                      )}
                      title={
                        bolge.ilceler.length > 0
                          ? `İlçeler: ${bolge.ilceler.join(", ")}`
                          : "İlçe bilgisi olmayan duraklar koordinata göre kümelendi"
                      }
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ChevronRightIcon
                          className={cn(
                            "size-3 shrink-0 text-muted-foreground transition-transform",
                            acik && "rotate-90"
                          )}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {bolge.ad}
                        </span>
                        <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                          {formatNumber(bolge.duraklar.length)} durak ·{" "}
                          {formatKg(Math.round(bolge.kg))} ·{" "}
                          {Math.round(bolge.depoyaKm)} km
                        </span>
                      </span>

                      <span className="flex min-w-0 flex-wrap items-center gap-1 pl-[18px]">
                        {araclar.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">
                            araca atanmadı
                          </span>
                        ) : (
                          araclar.map((a) => (
                            <span
                              key={a}
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[11px]",
                                araclar.length > 1
                                  ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                                  : "border-border/70 text-muted-foreground"
                              )}
                            >
                              {a}
                            </span>
                          ))
                        )}
                        {atanmamis > 0 && araclar.length > 0 ? (
                          <span className="text-[11px] text-muted-foreground">
                            +{formatNumber(atanmamis)} havuzda
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>

                  {acik ? (
                    <li className="bg-muted/20">
                      <ul className="divide-y divide-border/40">
                        {/* Ağır durak üstte: bölgeyi kim taşıyor, önce o okunur. */}
                        {[...bolge.duraklar]
                          .sort((a, b) => b.kg - a.kg)
                          .map((d) => {
                            const arac = durakAraci.get(d.musteriKodu) ?? null;
                            return (
                              <li
                                key={d.musteriKodu}
                                className="flex min-w-0 items-center gap-2 py-1.5 pr-3.5 pl-8"
                              >
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <MusteriAdIlce
                                    ad={d.unvan}
                                    ilce={d.ilce ?? null}
                                    className="text-[12.5px] text-foreground"
                                  />
                                  <span
                                    className={cn(
                                      "truncate text-[11px]",
                                      arac
                                        ? "text-muted-foreground"
                                        : "text-amber-600 dark:text-amber-400"
                                    )}
                                  >
                                    {arac ?? "havuzda — araca atanmadı"}
                                  </span>
                                </span>
                                <span className="shrink-0 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums">
                                  {formatKg(Math.round(d.kg))}
                                  <span className="block opacity-70">
                                    {formatNumber(Math.round(d.cuvalEsdeger))} çuval
                                  </span>
                                </span>
                              </li>
                            );
                          })}
                      </ul>
                    </li>
                  ) : null}
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}
