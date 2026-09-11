"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MapIcon,
  PinIcon,
} from "lucide-react";

import { MusteriAdIlce } from "@/components/sevkiyat/MusteriAdIlce";
import { bolgeRengi } from "@/lib/rota/bolge-renk";
import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import type { Bolge } from "@/lib/rota/bolge";
import type { RotaAraci } from "@/hooks/useRotaPlani";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BolgeOzetiProps {
  bolgeler: Bolge[];
  /** musteriKodu → aracAd. Plana girmemiş durak haritada olmaz. */
  durakAraci: Map<string, string>;
  /** Sabitleme için filo. Boş geçilirse sabitleme kontrolü çıkmaz. */
  filo: RotaAraci[];
  /** Bölge kodu → araç kodu. */
  sabitlemeler: Record<string, string>;
  onSabitle: (bolgeKod: string, aracKod: string | null) => void;
  /** Sabitleme yalnız bölge stratejisinde anlamlı; sweep/ffd yok sayar. */
  sabitlemeAcik: boolean;
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
export function BolgeOzeti({
  bolgeler,
  durakAraci,
  filo,
  sabitlemeler,
  onSabitle,
  sabitlemeAcik,
  loading,
}: BolgeOzetiProps) {
  /** Aynı anda tek bölge açık — panel dar, birden fazlası listeyi boğuyor. */
  const [acikKod, setAcikKod] = useState<string | null>(null);
  /**
   * Panelin kendisi VARSAYILAN KAPALI.
   *
   * İçeriği doğrulama, iş değil: "bu bölgeye kim gidiyor, bölündü mü". Sürekli
   * açık 288px'lik bir kutu olarak durduğunda planlama ekranındaki on bir
   * sürekli açık bölgeden biriydi. Başlıktaki özet (kaç bölge, kaçı bölünmüş)
   * kapalıyken de görünüyor — sorun varsa zaten oradan okunuyor.
   */
  const [panelAcik, setPanelAcik] = useState(false);

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
      <h2>
        <button
          type="button"
          onClick={() => setPanelAcik((o) => !o)}
          aria-expanded={panelAcik}
          title={
            panelAcik
              ? "Bölge listesini kapat"
              : "Hangi bölgeye kim gidiyor, bölündü mü — listeyi aç"
          }
          className={cn(
            "flex h-11 w-full shrink-0 items-center justify-between gap-3 px-3.5 text-left transition-colors hover:bg-accent/40",
            panelAcik && "border-b border-border/60"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            <MapIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">Bölgeler</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {bolunmus > 0 ? (
              <span className="flex items-center gap-1 text-[11.5px] font-medium text-caution">
                <AlertTriangleIcon className="size-3" strokeWidth={2} aria-hidden />
                {formatNumber(bolunmus)} bölünmüş
              </span>
            ) : null}
            <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">
              {formatNumber(satirlar.length)}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                panelAcik && "rotate-180"
              )}
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
        </button>
      </h2>

      <div
        ref={scrollRef}
        hidden={!panelAcik}
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
                        {/* Havuz listesiyle AYNI renk — bkz. bolgeRengi. */}
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: bolgeRengi(bolge.kod) }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {bolge.ad}
                        </span>
                        {sabitlemeler[bolge.kod] ? (
                          <PinIcon
                            className="size-3 shrink-0 text-foreground"
                            strokeWidth={2}
                            aria-label="araca sabitlendi"
                          />
                        ) : null}
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
                                  ? "border-caution/40 text-caution"
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
                      {/*
                        Günlük sabitleme. Kalıcı bölge-araç eşlemesi bilerek
                        yok: aynı bölge bir gün 200, ertesi gün 900 çuval
                        olabiliyor ve sabit eşleme o hatta yük olmayan günlerde
                        en büyük kamyonu boş bekletir.
                      */}
                      {sabitlemeAcik && filo.length > 0 ? (
                        <div className="flex min-w-0 flex-wrap items-center gap-1 border-b border-border/40 py-1.5 pr-3.5 pl-8">
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Araca sabitle
                          </span>
                          {filo.map((a) => {
                            const secili = sabitlemeler[bolge.kod] === a.kod;
                            return (
                              <button
                                key={a.kod}
                                type="button"
                                aria-pressed={secili}
                                onClick={() =>
                                  onSabitle(bolge.kod, secili ? null : a.kod)
                                }
                                title={
                                  secili
                                    ? `Sabitlemeyi kaldır — ${a.ad}`
                                    : `Bu bölgeyi ${a.ad} aracına sabitle; otomatik dağıtım ona dokunmaz`
                                }
                                className={cn(
                                  "shrink-0 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                                  secili
                                    ? "border-foreground/40 bg-foreground text-background"
                                    : "border-border/70 text-muted-foreground hover:text-foreground"
                                )}
                              >
                                {a.ad}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

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
                                        : "text-caution"
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
      {panelAcik ? <ScrollBottomFade /> : null}
    </section>
  );
}
