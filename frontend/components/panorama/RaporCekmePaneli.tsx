"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  LoaderIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  anahtarlariCoz,
  secimEtiketi,
  secimSuresiSn,
  useRaporCekme,
} from "@/hooks/useRaporCekme";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  PANORAMA_ZINCIRLERI,
  type RaporMetrigi,
  type RaporOzeti,
} from "@/lib/panorama-raporlar";
import type { ZincirIlerlemesi } from "@/lib/panorama-manual-sync";
import { cn } from "@/lib/utils";

function sureMetni(sn: number): string {
  if (sn <= 0) return "—";
  if (sn < 90) return `~${sn} sn`;
  return `~${Math.round(sn / 60)} dk`;
}

function metrikMetni(m: RaporMetrigi): string {
  return m.tip === "para" ? formatCurrency(m.deger) : formatNumber(m.deger);
}

function Kutu({ isaretli }: { isaretli: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        isaretli ? "border-transparent bg-ink text-card" : "border-line-strong bg-card"
      )}
    >
      {isaretli ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

/** Seçilen raporların kutu içinde özeti — çekim başladıktan sonra kalan iz. */
function SecimKutusu({ etiket, sag }: { etiket: string; sag?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-line bg-inset px-3 py-2">
      <DownloadIcon className="size-3.5 shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{etiket}</span>
      {sag}
    </div>
  );
}

function IlerlemeSatiri({ adim }: { adim: ZincirIlerlemesi }) {
  const ikon =
    adim.durum === "bitti" ? (
      <CheckIcon className="size-3.5 text-ink-green" strokeWidth={3} />
    ) : adim.durum === "hata" ? (
      <AlertCircleIcon className="size-3.5 text-destructive" />
    ) : adim.durum === "calisiyor" ? (
      <LoaderIcon className="size-3.5 animate-spin text-ink-2" />
    ) : (
      <span className="size-1.5 rounded-full bg-line-strong" />
    );

  return (
    <li className="flex items-center gap-2.5 py-1">
      <span className="flex size-3.5 shrink-0 items-center justify-center">{ikon}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12.5px]",
          adim.durum === "bekliyor" ? "text-ink-3" : "text-ink"
        )}
      >
        {adim.ad}
      </span>
      {adim.durum === "bitti" && adim.satirSayisi != null ? (
        <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">
          {formatNumber(adim.satirSayisi)} satır
        </span>
      ) : adim.durum === "hata" ? (
        <span className="shrink-0 text-[11.5px] text-destructive">hata</span>
      ) : null}
    </li>
  );
}

function OzetKarti({ rapor }: { rapor: RaporOzeti }) {
  const fark =
    rapor.satirSayisi != null && rapor.oncekiSatir != null
      ? rapor.satirSayisi - rapor.oncekiSatir
      : null;

  return (
    <li className="border-t border-line px-3 py-2.5 first:border-t-0">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
          {rapor.ad}
        </span>
        {rapor.satirSayisi != null ? (
          <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">
            {formatNumber(rapor.satirSayisi)} satır
            {fark != null && fark !== 0 ? (
              <span className={fark > 0 ? "text-ink-green" : "text-ink-orange"}>
                {" "}
                {fark > 0 ? "+" : ""}
                {formatNumber(fark)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {rapor.hata ? (
        <p className="mt-1 text-[11.5px] text-destructive">{rapor.hata}</p>
      ) : rapor.metrikler.length > 0 ? (
        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {rapor.metrikler.map((m) => (
            <div key={m.etiket} className="flex items-baseline gap-1.5">
              <dt className="text-[11.5px] text-ink-3">{m.etiket}</dt>
              <dd className="text-[12.5px] font-medium tabular-nums text-ink">
                {metrikMetni(m)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

/**
 * Rapor çekme paneli — seçim → çekim → özet.
 *
 * Sohbetteki kart ve ana sayfadaki "Şimdi çek" düğmesi aynı bileşeni
 * kullanır. Seçim kutucukları YEREL (her panelin kendi taslağı), ama çekim
 * başladığı an iş `RaporCekmeProvider`'a devredilir: aynı anda tek çekim
 * olabilir ve sayfa değişse bile ilerleme/özet kaybolmaz.
 */
export function RaporCekmePaneli({
  baslik = "Hangi raporlar çekilsin?",
  onSecili,
  onBitti,
  className,
}: {
  baslik?: string;
  onSecili?: readonly string[];
  onBitti?: (ozet: RaporOzeti[]) => void;
  className?: string;
}) {
  const { run, calisiyor, basla, temizle } = useRaporCekme();
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set(onSecili ?? [])
  );

  const zincirler = PANORAMA_ZINCIRLERI;
  const hepsi = secili.size === zincirler.length;
  const hicbiri = secili.size === 0;

  const tahminiSn = useMemo(
    () => secimSuresiSn(zincirler.filter((z) => secili.has(z.anahtar))),
    [zincirler, secili]
  );

  const calisanZincirler = useMemo(
    () => (run ? anahtarlariCoz(run.anahtarlar) : []),
    [run]
  );
  const bitenSayisi = run?.ilerleme.filter((i) => i.durum === "bitti").length ?? 0;

  // Çekim artık provider'da bittiği için `onBitti`'yi burada tetikliyoruz.
  // basladiAt'e bakarak her çekim için bir kez: aynı özet iki panelde
  // açıkken de tekrar tekrar bildirmesin.
  const bildirildiRef = useRef<number | null>(null);
  useEffect(() => {
    if (run?.asama !== "ozet") return;
    if (bildirildiRef.current === run.basladiAt) return;
    bildirildiRef.current = run.basladiAt;
    onBitti?.(run.ozet);
  }, [run, onBitti]);

  function degistir(anahtar: string) {
    if (calisiyor) return;
    setSecili((o) => {
      const s = new Set(o);
      if (s.has(anahtar)) s.delete(anahtar);
      else s.add(anahtar);
      return s;
    });
  }

  function hepsiniDegistir() {
    if (calisiyor) return;
    setSecili(hepsi ? new Set() : new Set(zincirler.map((z) => z.anahtar)));
  }

  async function calistir() {
    if (hicbiri || calisiyor) return;
    await basla([...secili]);
  }

  // --- Çekim sürüyor ---------------------------------------------------
  if (run?.asama === "cekiliyor") {
    return (
      <div className={cn("w-full", className)}>
        <SecimKutusu
          etiket={secimEtiketi(calisanZincirler, zincirler.length)}
          sag={
            <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] tabular-nums text-ink-3">
              <LoaderIcon className="size-3 animate-spin" />
              {bitenSayisi}/{run.ilerleme.length}
            </span>
          }
        />
        <ul className="mt-1.5 px-1">
          {run.ilerleme.map((a) => (
            <IlerlemeSatiri key={a.anahtar} adim={a} />
          ))}
        </ul>
        <p className="mt-1 px-1 text-[11.5px] text-ink-3">
          Arka planda sürüyor — başka sayfaya geçebilirsin.
        </p>
      </div>
    );
  }

  // --- Hata ------------------------------------------------------------
  if (run?.asama === "hata") {
    return (
      <div className={cn("w-full", className)}>
        <SecimKutusu etiket={secimEtiketi(calisanZincirler, zincirler.length)} />
        <p className="mt-1.5 flex items-start gap-1.5 px-1 text-[12px] text-destructive">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{run.hata}</span>
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={temizle}>
          Yeniden dene
        </Button>
      </div>
    );
  }

  // --- Özet ------------------------------------------------------------
  if (run?.asama === "ozet") {
    const hatali = run.ozet.filter((r) => r.hata).length;
    return (
      <div className={cn("w-full", className)}>
        <SecimKutusu
          etiket={secimEtiketi(calisanZincirler, zincirler.length)}
          sag={
            <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-ink-green">
              <CheckIcon className="size-3" strokeWidth={3} />
              çekildi
            </span>
          }
        />

        <div className="mt-2 overflow-hidden rounded-[12px] border border-line bg-card">
          <ul>
            {run.ozet.map((r) => (
              <OzetKarti key={r.anahtar} rapor={r} />
            ))}
          </ul>
        </div>

        {hatali > 0 ? (
          <p className="mt-1.5 px-1 text-[11.5px] text-ink-orange">
            {hatali} rapor hatayla bitti — n8n execution loguna bakın.
          </p>
        ) : null}

        <div className="mt-1 flex items-center gap-1">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="group flex h-7 items-center gap-1 rounded-[6px] px-1 text-[11.5px] text-ink-3 outline-none transition-colors hover:bg-hover-2 hover:text-ink-2">
              <ChevronRightIcon className="size-3 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-90" />
              <span>Çekim adımları</span>
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <ul className="px-1 pb-1">
                {run.ilerleme.map((a) => (
                  <IlerlemeSatiri key={a.anahtar} adim={a} />
                ))}
              </ul>
            </CollapsiblePanel>
          </Collapsible>
          <button
            type="button"
            onClick={temizle}
            className="ml-auto h-7 rounded-[6px] px-2 text-[11.5px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink-2"
          >
            Yeni çekim
          </button>
        </div>
      </div>
    );
  }

  // --- Seçim -----------------------------------------------------------
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-[12px] border border-line bg-card",
        className
      )}
    >
      <div className="flex items-baseline gap-2 px-3 pt-3 pb-2">
        <span className="text-[13px] font-medium text-ink">{baslik}</span>
        <span className="ml-auto text-[11.5px] tabular-nums text-ink-3">
          {hicbiri ? "seçim yok" : `${secili.size} seçili · ${sureMetni(tahminiSn)}`}
        </span>
      </div>

      {/* Liste kaydırılır: 7 raporun hepsini birden basmak kartı uzatıyordu. */}
      <div className="agent-table-scroll max-h-[13.5rem] overflow-y-auto border-t border-line">
        <button
          type="button"
          onClick={hepsiniDegistir}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-hover"
        >
          <Kutu isaretli={hepsi} />
          <span className="text-[12.5px] font-medium text-ink">Hepsi</span>
          <span className="ml-auto text-[11px] text-ink-3">{zincirler.length} rapor</span>
        </button>

        {zincirler.map((z) => {
          const isaretli = secili.has(z.anahtar);
          return (
            <button
              key={z.anahtar}
              type="button"
              onClick={() => degistir(z.anahtar)}
              aria-pressed={isaretli}
              className={cn(
                "flex w-full items-start gap-2.5 border-t border-line px-3 py-2 text-left transition-colors hover:bg-hover",
                isaretli && "bg-hover-2"
              )}
            >
              <span className="pt-0.5">
                <Kutu isaretli={isaretli} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] leading-5 text-ink">
                    {z.ad}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-3">
                    {sureMetni(z.tahminiSn)}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-4 text-ink-3">
                  {z.aciklama}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <Button size="sm" onClick={() => void calistir()} disabled={hicbiri}>
          Çek
        </Button>
        <span className="text-[11.5px] text-ink-3">
          Panorama&apos;dan canlı çekilir, arka planda sürer.
        </span>
      </div>
    </div>
  );
}
