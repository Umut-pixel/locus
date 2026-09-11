"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  AlertTriangleIcon,
  LoaderIcon,
  MapPinIcon,
  PackagePlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { EntityNotesButton } from "@/components/map/EntityNotesButton";
import type { RotaAraci, RotaDuragi } from "@/hooks/useRotaPlani";
import { formatCurrency, formatKg, formatNumber } from "@/lib/format";
import { RISK_COLORS, RISK_LABELS } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

/** `CustomerDetailPanel` / `harita` sayfasıyla aynı cam reçetesi — üçüncü kopya, bkz. tech-debt notu. */
const CAM =
  "border border-border/45 bg-popover/90 text-popover-foreground " +
  "shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)] backdrop-blur-[24px] backdrop-saturate-150";

const CARD_W = 288;
const GAP = 16;
const EDGE = 12;

export interface DurakRotaBaglami {
  aracKod: string;
  aracAd: string;
  renk: string;
  /** 1 tabanlı sıra — güzergahtaki N. durak. */
  sira: number;
}

export interface DurakSecimi {
  durak: RotaDuragi;
  /** `null` ise durak havuzda — henüz hiçbir araca atanmadı. */
  rota: DurakRotaBaglami | null;
  /** Seçim anındaki harita-konteyneri koordinatı — pan/zoom'da güncellenmez. */
  nokta: { x: number; y: number };
}

interface DurakDetayKartiProps {
  secim: DurakSecimi;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Havuzdaki durak için "rotaya ekle" hedefleri — `null` ise eylem kapalı (kayıtlı/dondurulmuş mod). */
  filo: RotaAraci[] | null;
  onClose: () => void;
  /** `null` ise eylem yok (kayıtlı moddaki dondurulmuş plan salt okunur). */
  onRotadanCikar: (() => void | Promise<void>) | null;
  onRotayaEkle: ((aracKod: string) => void | Promise<void>) | null;
  cikariliyor: boolean;
  ekleniyorAracKod: string | null;
}

/**
 * Numaralı bir durağa (ya da havuzdaki bir noktaya) tıklanınca haritada açılan
 * bilgi kartı — `CustomerDetailPanel`'in cam dizaynıyla aynı dil, ama tek
 * sayfalı ve sürüklenemez: rota durağı, müşteri kartının drag/sheet
 * karmaşıklığını gerektirmiyor.
 *
 * Aynı satır iki farklı modda görünür:
 * - GÜZERGAHTA: "N. durak · Araç" rozeti + "Rotadan çıkar".
 * - HAVUZDA: "Atanmadı" rozeti + filodaki her araç için "Rotaya ekle" düğmesi.
 */
export function DurakDetayKarti({
  secim,
  containerRef,
  filo,
  onClose,
  onRotadanCikar,
  onRotayaEkle,
  cikariliyor,
  ekleniyorAracKod,
}: DurakDetayKartiProps) {
  const { durak, rota, nokta } = secim;
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const busy = cikariliyor || ekleniyorAracKod != null;

  useLayoutEffect(() => {
    const card = cardRef.current;
    const container = containerRef.current;
    if (!card || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const cardH = card.offsetHeight || 260;
    const cardW = card.offsetWidth || CARD_W;

    let left = nokta.x + GAP;
    if (cw > 0 && left + cardW + EDGE > cw) left = nokta.x - GAP - cardW;
    left = Math.min(Math.max(left, EDGE), Math.max(EDGE, cw - cardW - EDGE));

    let top = nokta.y - cardH * 0.4;
    top = Math.min(Math.max(top, EDGE), Math.max(EDGE, ch - cardH - EDGE));

    setPos({ left, top });
    // Yalnız SEÇİM ANINDA konumlan — `CustomerDetailPanel`teki `anchor` gibi
    // pan/zoom'u canlı izlemiyor, harita üzerinde ekstra bir 'move' dinleyicisi
    // gerektirmesin diye.
  }, [durak.musteriKodu, nokta.x, nokta.y, containerRef]);

  const risk = durak.riskDurumu;

  return (
    <div
      key={durak.musteriKodu}
      ref={cardRef}
      style={{
        position: "absolute",
        left: pos?.left ?? nokta.x,
        top: pos?.top ?? nokta.y,
        width: CARD_W,
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "pointer-events-auto z-30 flex max-h-[min(70vh,26rem)] flex-col overflow-hidden rounded-2xl",
        CAM
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/40 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {durak.musteriKodu}
            {durak.sehir ? ` · ${durak.sehir}` : ""}
            {durak.ilce ? ` / ${durak.ilce}` : ""}
          </p>
          <p className="mt-0.5 text-[13.5px] font-medium text-foreground">{durak.unvan}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kartı kapat"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <XIcon className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 bg-muted/20 px-3.5 py-1.5">
        {rota ? (
          <>
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold text-white"
              style={{ background: rota.renk }}
              aria-hidden
            >
              {rota.sira}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
              {rota.sira}. durak · {rota.aracAd}
            </span>
          </>
        ) : (
          <>
            <MapPinIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
              Atanmadı — havuzda bekliyor
            </span>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        <dl className="flex flex-col gap-2 text-xs">
          <Satir label="Sipariş sayısı" value={formatNumber(durak.siparisSayisi)} />
          <Satir
            label="Yük"
            value={`${formatKg(Math.round(durak.kg))} · ${formatNumber(Math.round(durak.cuvalEsdeger))} çuval`}
            strong
          />
          {durak.brutTutar > 0 ? (
            <Satir label="Sipariş tutarı" value={formatCurrency(durak.brutTutar)} />
          ) : null}
          {durak.yasGun != null ? (
            <Satir label="Bekleyen sipariş yaşı" value={`${formatNumber(durak.yasGun)} gün`} />
          ) : null}
          {risk ? (
            <Satir
              label="Risk durumu"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: RISK_COLORS[risk] }}
                    aria-hidden
                  />
                  {RISK_LABELS[risk]}
                </span>
              }
            />
          ) : null}
        </dl>

        {durak.olcusuzSatir > 0 ? (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-md border border-caution/30 bg-caution/10 px-2 py-1.5 text-[11px] leading-snug text-caution">
            <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" strokeWidth={2} aria-hidden />
            {formatNumber(durak.olcusuzSatir)} satırın ölçüsü bilinmiyor — yük olduğundan az
            görünüyor olabilir.
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 bg-muted/20 px-3.5 py-2.5">
        {rota && onRotadanCikar ? (
          <button
            type="button"
            onClick={() => void onRotadanCikar()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {cikariliyor ? (
              <LoaderIcon className="size-3.5 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Trash2Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            Rotadan çıkar
          </button>
        ) : null}

        {!rota && onRotayaEkle && filo && filo.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">Rotaya ekle</span>
            <div className="flex flex-wrap gap-1">
              {filo.map((a) => {
                const buEkleniyor = ekleniyorAracKod === a.kod;
                return (
                  <button
                    key={a.kod}
                    type="button"
                    disabled={busy}
                    onClick={() => void onRotayaEkle(a.kod)}
                    title={`${durak.unvan} → ${a.ad} aracına ekle, güzergahı yeniden hesapla`}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                      "border-border/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                      busy && !buEkleniyor && "opacity-40"
                    )}
                  >
                    {buEkleniyor ? (
                      <LoaderIcon className="size-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
                    ) : (
                      <PackagePlusIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                    )}
                    {a.ad}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2">
          <span className="text-[11px] text-muted-foreground">Not</span>
          <EntityNotesButton entityKind="musteri" musteriKodu={durak.musteriKodu} />
        </div>
      </div>
    </div>
  );
}

function Satir({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right font-mono tabular-nums",
          strong ? "font-semibold text-foreground" : "text-foreground/90"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
