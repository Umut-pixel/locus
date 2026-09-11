"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AlertTriangleIcon,
  LoaderIcon,
  MapIcon,
  MapPinIcon,
  PackagePlusIcon,
  Trash2Icon,
  TruckIcon,
  XIcon,
} from "lucide-react";

import { EntityNotesButton } from "@/components/map/EntityNotesButton";
import { Button } from "@/components/ui/button";
import { GsapCollapse } from "@/components/ui/gsap-collapse";
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

/** `onRotayaEklemeOnizle`'nin döndürdüğü, henüz HİÇBİR ŞEYE dokunmamış önizleme. */
export interface EklemeOnizlemesi {
  aracAd: string;
  toplamDurak: number;
  kg: number;
  yuzde: number;
  asim: boolean;
}

interface DurakDetayKartiProps {
  secim: DurakSecimi;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Havuzdaki durak için "rotaya ekle" hedefleri — `null` ise eylem kapalı (kayıtlı/dondurulmuş mod). */
  filo: RotaAraci[] | null;
  /**
   * Odaklanılan/aktif araç — doluysa ve bu durak havuzdaysa "Rotaya ekle"
   * doğrudan bu araca hedeflenir, filo seçici hiç gösterilmez. `null` ise
   * (hiçbir araca odaklanılmamışsa) kullanıcı filodan seçer.
   */
  aktifArac: { kod: string; ad: string } | null;
  onClose: () => void;
  /** `null` ise eylem yok (kayıtlı moddaki dondurulmuş plan salt okunur). */
  onRotadanCikar: (() => void | Promise<void>) | null;
  /**
   * Bir araca tıklanınca ÖNCE bu çağrılır — hiçbir şeyi değiştirmez, yalnız
   * "eklenirse ne olur" sorusunu cevaplar. `BolgeOzeti`nin toplu yükleme
   * akışıyla aynı iki adımlı desen: seç → önizle → onayla.
   */
  onRotayaEklemeOnizle: ((aracKod: string) => EklemeOnizlemesi | null) | null;
  /** Kullanıcı önizlemeyi ONAYLADIKTAN SONRA çağrılır. */
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
  aktifArac,
  onClose,
  onRotadanCikar,
  onRotayaEklemeOnizle,
  onRotayaEkle,
  cikariliyor,
  ekleniyorAracKod,
}: DurakDetayKartiProps) {
  const { durak, rota, nokta } = secim;
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const busy = cikariliyor || ekleniyorAracKod != null;

  /**
   * Tıklanan ama HENÜZ ONAYLANMAMIŞ araç — `onRotayaEkle` doğrudan
   * çağrılmıyor, yalnız hangi aracın önizleneceği seçiliyor. Aktif/odaklı bir
   * araç varsa hedef doğrudan o — kullanıcı seçmiyor, yalnız önizlemeyi
   * onaylıyor ya da kartı kapatıyor.
   */
  const [seciliAracKod, setSeciliAracKod] = useState<string | null>(() => aktifArac?.kod ?? null);
  useEffect(() => {
    setSeciliAracKod(aktifArac?.kod ?? null);
  }, [aktifArac?.kod]);

  const onizleme = useMemo(
    () => (seciliAracKod != null ? (onRotayaEklemeOnizle?.(seciliAracKod) ?? null) : null),
    [seciliAracKod, onRotayaEklemeOnizle]
  );

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
        {/*
          İkon kümesi `CustomerDetailPanel`teki (Harita sekmesi) düzenin
          aynısı: Not, kapat X — aynı sırada, aynı boyutta. Eskiden Not
          alt bilgide "etiket + generic ikon" satırıydı; burada diğer
          kartla aynı dilde bir başlık eylemi.
        */}
        <div className="flex shrink-0 items-center gap-0.5">
          <EntityNotesButton entityKind="musteri" musteriKodu={durak.musteriKodu} className="size-8" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Kartı kapat"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <XIcon className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
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
        {!rota && onRotayaEkle ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {aktifArac ? `Rotaya ekle — ${aktifArac.ad}` : "Rotaya ekle"}
            </span>

            {/*
              Aktif/odaklı bir araç varsa (haritada tek araca odaklanılmışsa)
              hedef zaten belli — filo seçici gösterilmez, doğrudan o aracın
              önizlemesi çıkar. Değilse filodan seçilir.
            */}
            {!aktifArac && filo && filo.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {filo.map((a) => {
                  const buSecili = seciliAracKod === a.kod;
                  const buEkleniyor = buSecili && ekleniyorAracKod === a.kod;
                  return (
                    <button
                      key={a.kod}
                      type="button"
                      disabled={busy}
                      onClick={() => setSeciliAracKod((k) => (k === a.kod ? null : a.kod))}
                      aria-pressed={buSecili}
                      title={`${durak.unvan} → ${a.ad} aracına eklemeyi önizle`}
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                        buSecili
                          ? "border-foreground/50 bg-foreground/5 text-foreground"
                          : "border-border/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                        busy && !buEkleniyor && "opacity-40"
                      )}
                    >
                      {buEkleniyor ? (
                        <LoaderIcon className="size-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
                      ) : buSecili ? (
                        <TruckIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                      ) : (
                        <PackagePlusIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                      )}
                      {a.ad}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <GsapCollapse open={onizleme != null}>
              {onizleme ? (
                <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2">
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      onizleme.asim ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    Sonrası: {formatNumber(onizleme.toplamDurak)} durak ·{" "}
                    {formatKg(Math.round(onizleme.kg))} · doluluk %{Math.round(onizleme.yuzde)}
                    {onizleme.asim ? " · kapasite aşımı" : ""}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {aktifArac ? null : (
                      <button
                        type="button"
                        onClick={() => setSeciliAracKod(null)}
                        disabled={busy}
                        className="flex items-center gap-1 rounded border border-border/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
                      >
                        <XIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                        Vazgeç
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => seciliAracKod && void onRotayaEkle(seciliAracKod)}
                      disabled={busy}
                      title="Durağı bu araca ekle, güzergahı yeniden hesapla"
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
                        onizleme.asim
                          ? "border-caution/50 bg-caution/10 text-caution hover:bg-caution/15"
                          : "border-foreground/30 bg-foreground text-background hover:bg-foreground/90"
                      )}
                    >
                      {ekleniyorAracKod === seciliAracKod ? (
                        <LoaderIcon className="size-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
                      ) : (
                        <MapIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                      )}
                      Onayla ve ekle
                    </button>
                  </div>
                </div>
              ) : null}
            </GsapCollapse>
          </div>
        ) : null}

        {rota && onRotadanCikar ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => void onRotadanCikar()}
            disabled={busy}
          >
            {cikariliyor ? (
              <LoaderIcon className="size-3.5 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Trash2Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            Rotadan çıkar
          </Button>
        ) : null}
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
