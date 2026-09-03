"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, LayersIcon, TruckIcon } from "lucide-react";

import { RotaHaritasi } from "@/components/rota/RotaHaritasi";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useRotaPlaniBaglami } from "../RotaPlaniProvider";

/**
 * Harita üstü panellerin cam görünümü — `FilterPanel` (overlay) ve
 * `CustomerDetailPanel` ile aynı reçete, Harita sekmesiyle tek dil.
 */
const CAM =
  "border border-border/45 bg-popover/66 text-popover-foreground " +
  "shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] backdrop-blur-[24px] backdrop-saturate-150";

/**
 * Tam ekran rota haritası.
 *
 * Kabuk `app/(app)/harita/page.tsx` deseninin aynısı: full-bleed harita +
 * `pointer-events-none` overlay katmanı, panellerde `pointer-events-auto`.
 * Perde `RotaHaritasi` içindeki `revealStageVeil` ile kalkıyor — harita bu
 * rotaya girildiğinde mount edildiği için geçiş her seferinde oynuyor.
 */
export default function RotaHaritasiSayfasi() {
  const { rotalar, havuz, loading } = useRotaPlaniBaglami();

  /** Tek araca odaklan — null ise hepsi görünür. */
  const [odak, setOdak] = useState<string | null>(null);
  const [havuzGoster, setHavuzGoster] = useState(true);

  const yuklu = useMemo(
    () => rotalar.filter((r) => r.duraklar.length > 0),
    [rotalar]
  );

  // Odaklanılan araç plandan çıkarsa odak kendiliğinden düşsün.
  const gecerliOdak =
    odak != null && yuklu.some((r) => r.aracKod === odak) ? odak : null;

  const gorunenRotalar = gecerliOdak
    ? yuklu.filter((r) => r.aracKod === gecerliOdak)
    : yuklu;

  // Tek araca odaklanınca havuz dikkat dağıtır; gizli tutuluyor.
  const gorunenHavuz = havuzGoster && gecerliOdak == null ? havuz : [];

  const odakla = (aracKod: string) =>
    setOdak((o) => (o === aracKod ? null : aracKod));

  const toplamDurak = gorunenRotalar.reduce((t, r) => t + r.duraklar.length, 0);

  return (
    <div className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden">
      <RotaHaritasi rotalar={gorunenRotalar} havuz={gorunenHavuz} />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-2 p-2 sm:p-3 md:p-4">
        {/* Sol üst: geri + araç listesi */}
        <div className="flex min-h-0 flex-wrap items-start gap-2">
          <div
            className={cn(
              "pointer-events-auto flex min-w-0 max-w-[20rem] flex-col overflow-hidden rounded-2xl",
              CAM
            )}
          >
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 px-2.5">
              <AppSidebarMobileTrigger embedded />
              <Link
                href="/rotalar"
                className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeftIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="truncate">Planlamaya dön</span>
              </Link>
            </div>

            <div className="max-h-[60vh] min-h-0 overflow-y-auto">
              {yuklu.length === 0 ? (
                <p className="px-2.5 py-3 text-[12px] text-muted-foreground">
                  {loading
                    ? "Yükleniyor…"
                    : "Henüz araca durak atanmadı — planlama ekranından dağıtın."}
                </p>
              ) : (
                <ul className="divide-y divide-border/30">
                  {yuklu.map((r) => {
                    const secili = gecerliOdak === r.aracKod;
                    const solgun = gecerliOdak != null && !secili;
                    const kg = r.duraklar.reduce((t, d) => t + d.kg, 0);
                    return (
                      <li key={r.aracKod}>
                        <button
                          type="button"
                          onClick={() => odakla(r.aracKod)}
                          aria-pressed={secili}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors",
                            secili ? "bg-accent/50" : "hover:bg-accent/30",
                            solgun && "opacity-40"
                          )}
                          title={
                            secili
                              ? `${r.aracAd} — tıkla, tüm araçlara dön`
                              : `${r.aracAd} — yalnız bu aracı göster`
                          }
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full ring-2 ring-background/60"
                            style={{ background: r.renk }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                            {r.aracAd}
                          </span>
                          <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                            {formatNumber(r.duraklar.length)} · {formatKg(Math.round(kg))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {havuz.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setHavuzGoster((o) => !o)}
                  aria-pressed={havuzGoster && gecerliOdak == null}
                  disabled={gecerliOdak != null}
                  className={cn(
                    "flex w-full items-center gap-2 border-t border-border/40 px-2.5 py-2 text-left transition-colors hover:bg-accent/30",
                    (!havuzGoster || gecerliOdak != null) && "opacity-40"
                  )}
                  title={
                    gecerliOdak != null
                      ? "Tek araca odaklıyken atanmamış duraklar gizli"
                      : "Atanmamış durakları göster/gizle"
                  }
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full border border-muted-foreground/60"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                    Atanmamış
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                    {formatNumber(havuz.length)}
                  </span>
                </button>
              ) : null}
            </div>

            {gecerliOdak != null ? (
              <button
                type="button"
                onClick={() => setOdak(null)}
                className="flex shrink-0 items-center gap-1.5 border-t border-border/40 px-2.5 py-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <LayersIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
                Tüm araçları göster
              </button>
            ) : null}
          </div>
        </div>

        {/* Sağ alt: özet */}
        {yuklu.length > 0 ? (
          <div className="flex justify-end">
            <div
              className={cn(
                "pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-1.5",
                CAM
              )}
            >
              <TruckIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="font-mono text-[12px] text-foreground tabular-nums">
                {formatNumber(gorunenRotalar.length)} araç ·{" "}
                {formatNumber(toplamDurak)} durak
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
