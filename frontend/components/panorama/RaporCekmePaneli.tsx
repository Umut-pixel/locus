"use client";

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
import { useRaporCekme, secimEtiketi } from "@/hooks/useRaporCekme";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { RaporMetrigi, RaporOzeti } from "@/lib/panorama-raporlar";
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
 * kullanır. Çekim başlayınca uzun seçim listesi tek satırlık bir kutuya
 * iner; bitince ilerleme katlanır ve yerini içerik özeti alır.
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
  const c = useRaporCekme({ onSecili, onBitti });

  if (c.asama === "secim") {
    return (
      <div className={cn("w-full overflow-hidden rounded-[12px] border border-line bg-card", className)}>
        <div className="flex items-baseline gap-2 px-3 pt-3 pb-2">
          <span className="text-[13px] font-medium text-ink">{baslik}</span>
          <span className="ml-auto text-[11.5px] tabular-nums text-ink-3">
            {c.hicbiri ? "seçim yok" : `${c.secili.size} seçili · ${sureMetni(c.tahminiSn)}`}
          </span>
        </div>

        {/* Liste kaydırılır: 7 raporun hepsini birden basmak kartı uzatıyordu. */}
        <div className="max-h-[13.5rem] overflow-y-auto border-t border-line agent-table-scroll">
          <button
            type="button"
            onClick={c.hepsiniDegistir}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-hover"
          >
            <Kutu isaretli={c.hepsi} />
            <span className="text-[12.5px] font-medium text-ink">Hepsi</span>
            <span className="ml-auto text-[11px] text-ink-3">{c.zincirler.length} rapor</span>
          </button>

          {c.zincirler.map((z) => {
            const isaretli = c.secili.has(z.anahtar);
            return (
              <button
                key={z.anahtar}
                type="button"
                onClick={() => c.degistir(z.anahtar)}
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
          <Button size="sm" onClick={() => void c.basla()} disabled={c.hicbiri}>
            Çek
          </Button>
          <span className="text-[11.5px] text-ink-3">
            Panorama&apos;dan canlı çekilir.
          </span>
        </div>
      </div>
    );
  }

  if (c.asama === "cekiliyor") {
    return (
      <div className={cn("w-full", className)}>
        <SecimKutusu
          etiket={secimEtiketi(c.secilenZincirler, c.zincirler.length)}
          sag={
            <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] tabular-nums text-ink-3">
              <LoaderIcon className="size-3 animate-spin" />
              {c.bitenSayisi}/{c.ilerleme.length}
            </span>
          }
        />
        <ul className="mt-1.5 px-1">
          {c.ilerleme.map((a) => (
            <IlerlemeSatiri key={a.anahtar} adim={a} />
          ))}
        </ul>
      </div>
    );
  }

  if (c.asama === "hata") {
    return (
      <div className={cn("w-full", className)}>
        <SecimKutusu etiket={secimEtiketi(c.secilenZincirler, c.zincirler.length)} />
        <p className="mt-1.5 flex items-start gap-1.5 px-1 text-[12px] text-destructive">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{c.hata}</span>
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={c.sifirla}>
          Yeniden dene
        </Button>
      </div>
    );
  }

  // Özet: ilerleme listesi katlanır, yerini içerik özeti alır.
  const hatali = c.ozet.filter((r) => r.hata).length;
  return (
    <div className={cn("w-full", className)}>
      <SecimKutusu
        etiket={secimEtiketi(c.secilenZincirler, c.zincirler.length)}
        sag={
          <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-ink-green">
            <CheckIcon className="size-3" strokeWidth={3} />
            çekildi
          </span>
        }
      />

      <div className="mt-2 overflow-hidden rounded-[12px] border border-line bg-card">
        <ul>
          {c.ozet.map((r) => (
            <OzetKarti key={r.anahtar} rapor={r} />
          ))}
        </ul>
      </div>

      {hatali > 0 ? (
        <p className="mt-1.5 px-1 text-[11.5px] text-ink-orange">
          {hatali} rapor hatayla bitti — n8n execution loguna bakın.
        </p>
      ) : null}

      <Collapsible defaultOpen={false} className="mt-1">
        <CollapsibleTrigger className="group flex h-7 items-center gap-1 rounded-[6px] px-1 text-[11.5px] text-ink-3 outline-none transition-colors hover:bg-hover-2 hover:text-ink-2">
          <ChevronRightIcon className="size-3 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-90" />
          <span>Çekim adımları</span>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <ul className="px-1 pb-1">
            {c.ilerleme.map((a) => (
              <IlerlemeSatiri key={a.anahtar} adim={a} />
            ))}
          </ul>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
}
