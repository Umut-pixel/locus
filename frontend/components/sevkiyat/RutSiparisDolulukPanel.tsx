"use client";

import { CheckCircle2Icon, RouteIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { RutSiparisDolulukSatiri } from "@/hooks/useSevkiyatRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RutSiparisDolulukPanelProps {
  satirlar: RutSiparisDolulukSatiri[];
  aktifRutSayisi: number;
  loading: boolean;
}

const TANIM =
  "Siparişli durak / rut müşterisi — araç kapasitesi değil.";

function yuzde(oran: number | null): string {
  if (oran == null) return "—";
  return `%${Math.round(oran * 100)}`;
}

/**
 * Bekleyen/irsaliyeli siparişlerin rut hatlarındaki durak doluluğu.
 * TeslimatGecikmeDagilimi'nin sol kolon kromu; bar doluluk = siparişli
 * müşteri / ruttaki müşteri (kamyon hacmi yok).
 */
export function RutSiparisDolulukPanel({
  satirlar,
  aktifRutSayisi,
  loading,
}: RutSiparisDolulukPanelProps) {
  const bos = satirlar.length === 0;
  const siparisliRut = satirlar.filter((s) => !s.rutsuz).length;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    satirlar.length
  );

  return (
    <section
      ref={wrapperRef}
      className="relative flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0"
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <RouteIcon
            className={cn("size-3.5 shrink-0", !bos && "text-amber-400")}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">Rut sipariş doluluğu</span>
        </h2>
        {!bos ? (
          <span
            className="shrink-0 font-mono text-[12.5px] font-medium text-amber-400 tabular-nums"
            title={`${formatNumber(siparisliRut)} rutta açık sipariş var, ${formatNumber(aktifRutSayisi)} aktif rut.`}
          >
            {formatNumber(siparisliRut)}
            <span className="text-muted-foreground">/{formatNumber(aktifRutSayisi)}</span>
          </span>
        ) : null}
      </header>

      {!bos ? (
        <p
          className="flex h-9 shrink-0 items-center border-b border-border/60 px-3.5 text-[12px] text-muted-foreground"
          title={TANIM}
        >
          <span className="truncate">{TANIM}</span>
        </p>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {bos ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <CheckCircle2Icon
              className="size-6 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[13px] text-muted-foreground">
              Açık sipariş yok — rutalarda bekleyen yük yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {satirlar.map((s) => (
              <RutDolulukSatiri key={s.rutsuz ? "__rutsuz" : s.rutKod} satir={s} />
            ))}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}

function RutDolulukSatiri({ satir }: { satir: RutSiparisDolulukSatiri }) {
  const doluluk = satir.doluluk == null ? 0 : Math.min(1, satir.doluluk);
  const siparisToplam = satir.siparisSayisi || 1;
  const bekleyenPay = satir.bekleyenSayisi / siparisToplam;
  const irsaliyeliPay = satir.irsaliyeliSayisi / siparisToplam;
  const oranEtiket = satir.rutsuz
    ? `${formatNumber(satir.siparisSayisi)} sipariş`
    : `${formatNumber(satir.siparisliMusteri)}/${formatNumber(satir.musteriSayisi)}`;

  return (
    <li
      className="flex min-w-0 flex-col gap-1.5 px-3.5 py-2"
      aria-label={
        satir.rutsuz
          ? `Rutsuz: ${formatNumber(satir.siparisSayisi)} sipariş, ${formatCurrency(satir.toplamTutar)}`
          : `${satir.rutKod}: ${oranEtiket} durak, ${yuzde(satir.doluluk)}, ${formatCurrency(satir.toplamTutar)}`
      }
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span
          className={cn(
            "shrink-0 font-mono text-[12.5px] font-medium tabular-nums",
            satir.rutsuz ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {satir.rutKod}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
          {satir.rutsuz
            ? "Ruta bağlanamayan siparişler"
            : (satir.rutAciklama ?? "")}
        </span>
        <span className="shrink-0 font-mono text-[12.5px] font-medium text-foreground tabular-nums">
          {formatCurrency(satir.toplamTutar)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/40"
          title={`Bekleyen: ${formatNumber(satir.bekleyenSayisi)} · İrsaliyeli: ${formatNumber(satir.irsaliyeliSayisi)}`}
        >
          {!satir.rutsuz && doluluk > 0 ? (
            <div className="flex h-full" style={{ width: `${doluluk * 100}%` }}>
              {bekleyenPay > 0 ? (
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${bekleyenPay * 100}%` }}
                />
              ) : null}
              {irsaliyeliPay > 0 ? (
                <div
                  className="h-full bg-sky-400"
                  style={{ width: `${irsaliyeliPay * 100}%` }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <span className="w-[5.25rem] shrink-0 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {oranEtiket}
        </span>
        <span className="w-10 shrink-0 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {yuzde(satir.doluluk)}
        </span>
      </div>
    </li>
  );
}
