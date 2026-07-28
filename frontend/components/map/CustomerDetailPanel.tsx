"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GripHorizontalIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from "motion/react";

import { Button } from "@/components/ui/button";
import { SegmentBar } from "@/components/ui/segment-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, formatDate, formatKg, formatNumber } from "@/lib/format";
import {
  HASSASIYET_LABELS,
  RISK_COLORS,
  RISK_LABELS,
  RISK_ORDER,
  RISK_SHORT_LABELS,
} from "@/lib/risk-style";
import {
  AKSIYON_GUN,
  evaluateMusteriForm,
  esigeKalanGun,
  formDurumu,
  FORM_LABELS,
  OLAY_LABELS,
  type FormDurumu,
  type FormOlay,
  type MusteriSnapshotRow,
  type SnapshotMetrics,
} from "@/lib/snapshot-compare";
import {
  MUSTERI_SNAPSHOTLARI_TABLE,
  supabase,
} from "@/lib/supabase";
import type { MusteriHarita, RiskDurumu } from "@/lib/types";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 304;
const ANCHOR_GAP = 18;
const EDGE_MARGIN = 12;
const COMPACT_BREAKPOINT = 640;

const FORM_COLORS: Record<FormDurumu, string> = {
  ritimde: RISK_COLORS.saglikli,
  yaklasiyor: RISK_COLORS.izlenmeli,
  esik_asildi: RISK_COLORS.riskli,
  sessiz: RISK_COLORS.hic_teslimat_yok,
};

const OLAY_COLORS: Record<FormOlay, string> = {
  kazanim: RISK_COLORS.saglikli,
  uyari: RISK_COLORS.izlenmeli,
  aksiyon: RISK_COLORS.riskli,
  ritim: "var(--muted-foreground)",
  sessiz: RISK_COLORS.hic_teslimat_yok,
};

type PanelPage = "ozet" | "ritim";

const PAGE_INDEX: Record<PanelPage, number> = { ozet: 0, ritim: 1 };

const pageSlideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 24 : -24,
    opacity: 0,
  }),
};

const pageSlideTransition = {
  x: { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.85 },
  opacity: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

const heightSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 34,
  mass: 0.9,
};

const titleSlideVariants = {
  enter: (direction: number) => ({
    y: direction > 0 ? 6 : -6,
    opacity: 0,
  }),
  center: { y: 0, opacity: 1 },
  exit: (direction: number) => ({
    y: direction < 0 ? 6 : -6,
    opacity: 0,
  }),
};

export interface PanelAnchor {
  /** Seçim anındaki ekran konumu — pan/zoom ile güncellenmez. */
  x: number;
  y: number;
}

interface CustomerDetailPanelProps {
  musteri: MusteriHarita;
  anchor: PanelAnchor;
  containerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onShowRoute: (rutKod: string) => void;
}

export function CustomerDetailPanel({
  musteri,
  anchor,
  containerRef,
  onClose,
  onShowRoute,
}: CustomerDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pageMeasureRef = useRef<HTMLDivElement | null>(null);
  const reanchorRef = useRef(true);
  const draggedRef = useRef(false);
  const dragControls = useDragControls();
  const [panelHeight, setPanelHeight] = useState(380);
  const [pageContentHeight, setPageContentHeight] = useState(220);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [page, setPage] = useState<PanelPage>("ozet");
  const [pageDirection, setPageDirection] = useState(0);
  const [snapshot, setSnapshot] = useState<MusteriSnapshotRow | null>(null);
  const [snapLoading, setSnapLoading] = useState(true);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const goToPage = (next: PanelPage) => {
    if (next === page) return;
    setPageDirection(PAGE_INDEX[next] - PAGE_INDEX[page]);
    setPage(next);
  };

  useEffect(() => {
    reanchorRef.current = true;
    setPage("ozet");
    setPageDirection(0);
    setSnapLoading(true);
    setSnapshot(null);

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from(MUSTERI_SNAPSHOTLARI_TABLE)
        .select(
          "musteri_kodu, risk_durumu, toplam_teslimat_sayisi, toplam_tutar, toplam_agirlik, son_teslimattan_gecen_gun, son_teslimat_tarihi, onceki_risk_durumu, onceki_toplam_teslimat_sayisi, onceki_toplam_tutar, onceki_toplam_agirlik, onceki_son_teslimattan_gecen_gun, onceki_son_teslimat_tarihi, olusturuldu"
        )
        .eq("musteri_kodu", musteri.musteri_kodu)
        .order("olusturuldu", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.warn("[CustomerDetailPanel] snapshot:", error.message);
        setSnapshot(null);
      } else {
        setSnapshot((data as MusteriSnapshotRow | null) ?? null);
      }
      setSnapLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [musteri.musteri_kodu]);

  useLayoutEffect(() => {
    const el = pageMeasureRef.current;
    if (!el) return;
    const update = () => {
      const next = el.offsetHeight;
      if (next > 0) setPageContentHeight((h) => (h === next ? h : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page, snapshot, snapLoading, musteri.musteri_kodu]);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      const next = el.offsetHeight;
      setPanelHeight((h) => (h === next ? h : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [musteri.musteri_kodu]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const containerW = containerSize.width;
  const containerH = containerSize.height;
  const isCompact = containerW > 0 && containerW < COMPACT_BREAKPOINT;
  const width = isCompact
    ? Math.max(0, containerW - EDGE_MARGIN * 2)
    : PANEL_WIDTH;

  // İlk açılış / müşteri değişimi: yerleşim. Sayfa geçişinde y'yi sıçratma.
  useLayoutEffect(() => {
    if (draggedRef.current) return;
    if (containerW <= 0 || containerH <= 0) return;

    if (reanchorRef.current) {
      const pos = computeAutoPosition({
        isCompact,
        anchor,
        containerW,
        containerH,
        panelHeight,
        panelWidth: width || PANEL_WIDTH,
      });
      x.set(pos.left);
      y.set(pos.top);
      reanchorRef.current = false;
      return;
    }

    const maxTop = Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN);
    const current = y.get();
    if (current > maxTop) {
      void animate(y, maxTop, heightSpring);
    }
  }, [
    musteri.musteri_kodu,
    anchor.x,
    anchor.y,
    containerW,
    containerH,
    panelHeight,
    width,
    isCompact,
    x,
    y,
  ]);

  const dragConstraints =
    containerW > 0 && containerH > 0
      ? {
          left: EDGE_MARGIN,
          top: EDGE_MARGIN,
          right: Math.max(EDGE_MARGIN, containerW - width - EDGE_MARGIN),
          bottom: Math.max(
            EDGE_MARGIN,
            containerH - panelHeight - EDGE_MARGIN
          ),
        }
      : undefined;

  const startDrag = (e: ReactPointerEvent) => {
    dragControls.start(e);
  };

  const accent = RISK_COLORS[musteri.risk_durumu];
  const hicTeslimat = musteri.risk_durumu === "hic_teslimat_yok";
  const gecikmeGun = musteri.son_teslimattan_gecen_gun;
  const gecikmeYuzde =
    !hicTeslimat && gecikmeGun != null
      ? Math.min(Math.round((gecikmeGun / AKSIYON_GUN) * 100), 999)
      : null;

  return (
    <motion.div
      ref={panelRef}
      layoutId="musteri-detail-panel"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{
        opacity: { duration: 0.16 },
        scale: { type: "spring", stiffness: 420, damping: 34 },
      }}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={dragConstraints}
      dragElastic={0.08}
      dragMomentum
      dragTransition={{
        power: 0.22,
        timeConstant: 220,
        bounceStiffness: 420,
        bounceDamping: 36,
      }}
      onDragStart={() => {
        draggedRef.current = true;
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      style={{ x, y, width, left: 0, top: 0 }}
      className={cn(
        "pointer-events-auto absolute z-20 flex max-h-[min(85dvh,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]",
        dragging && "cursor-grabbing select-none"
      )}
    >
      <div
        onPointerDown={startDrag}
        className={cn(
          "flex shrink-0 cursor-grab touch-none flex-col items-center active:cursor-grabbing",
          isCompact ? "pt-2 pb-0.5" : "pt-2.5 pb-0"
        )}
      >
        <span className="flex h-5 items-center justify-center text-muted-foreground/50">
          {isCompact ? (
            <span className="h-1 w-9 rounded-full bg-muted-foreground/35" />
          ) : (
            <GripHorizontalIcon className="size-4" />
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          onPointerDown={startDrag}
          className="flex cursor-grab touch-none items-start justify-between gap-3 px-4 active:cursor-grabbing"
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {musteri.musteri_kodu}
              {musteri.sehir ? ` · ${musteri.sehir}` : ""}
              {musteri.ilce ? ` / ${musteri.ilce}` : ""}
            </p>
            <h2 className="mt-1 line-clamp-2 text-sm leading-snug font-medium">
              {musteri.unvan}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Paneli kapat"
            className="-mt-1 -mr-1.5 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:size-auto sm:p-1.5"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        <div className="px-4 pt-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
              />
              <span
                className="font-mono text-[11px] tracking-wide uppercase"
                style={{ color: accent }}
              >
                {RISK_LABELS[musteri.risk_durumu]}
              </span>
            </span>
            {gecikmeYuzde != null && (
              <span
                className="font-mono text-lg font-semibold tabular-nums"
                style={{ color: accent }}
              >
                %{gecikmeYuzde}
              </span>
            )}
          </div>
          <SegmentBar
            className="mt-2"
            segments={24}
            value={gecikmeYuzde != null ? gecikmeYuzde / 100 : 0}
            color={accent}
            label={
              gecikmeYuzde != null
                ? `Gecikme eşiğinin %${gecikmeYuzde}'i`
                : "Teslimat kaydı yok"
            }
          />
          <p className="mt-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {hicTeslimat || gecikmeGun == null
              ? "Kayıtlı teslimat yok"
              : musteri.son_teslimat_tarihi
                ? `Son teslimat ${formatDate(musteri.son_teslimat_tarihi)} · ${formatNumber(gecikmeGun)} gün önce · eşik ${AKSIYON_GUN}`
                : `Son teslimat ${formatNumber(gecikmeGun)} gün önce · eşik ${AKSIYON_GUN} gün`}
          </p>
        </div>

        <div className="mx-4 mt-3.5 flex items-center gap-2 border-t pt-1">
          <div className="relative min-h-[1rem] min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={pageDirection} initial={false}>
              <motion.span
                key={page}
                custom={pageDirection}
                variants={titleSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-0 top-0 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                {page === "ozet" ? "Özet" : "Ritim"}
              </motion.span>
            </AnimatePresence>
          </div>
          <TooltipProvider delay={280}>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-disabled={page === "ozet"}
                  onClick={() => goToPage("ozet")}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Özet sayfası"
                  className={cn(
                    "flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    page === "ozet" && "cursor-default opacity-30 hover:bg-transparent"
                  )}
                >
                  <ChevronLeftIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className="px-2 py-1 font-mono text-[10px] tracking-wide uppercase"
                >
                  Özet
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-disabled={page === "ritim"}
                  onClick={() => goToPage("ritim")}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Ritim sayfası"
                  className={cn(
                    "flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    page === "ritim" &&
                      "cursor-default opacity-30 hover:bg-transparent"
                  )}
                >
                  <ChevronRightIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className="px-2 py-1 font-mono text-[10px] tracking-wide uppercase"
                >
                  Ritim
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        <motion.div
          initial={false}
          animate={{ height: pageContentHeight }}
          transition={heightSpring}
          className="relative overflow-hidden"
        >
          <AnimatePresence initial={false} custom={pageDirection} mode="sync">
            {page === "ozet" ? (
              <motion.div
                key="ozet"
                ref={pageMeasureRef}
                custom={pageDirection}
                variants={pageSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageSlideTransition}
                className="absolute inset-x-0 top-0 w-full px-4 py-3.5"
              >
                <dl className="flex flex-col gap-2 text-xs">
                  <MetricRow
                    label="Son teslimat"
                    value={formatDate(musteri.son_teslimat_tarihi)}
                    strong
                  />
                  <MetricRow
                    label="İlk teslimat"
                    value={formatDate(musteri.ilk_teslimat_tarihi)}
                  />
                  {musteri.son_teslimattan_gecen_gun != null && (
                    <MetricRow
                      label="Geçen gün"
                      value={`${formatNumber(musteri.son_teslimattan_gecen_gun)} gün`}
                    />
                  )}
                  <MetricRow
                    label="Teslimat sayısı"
                    value={formatNumber(musteri.toplam_teslimat_sayisi)}
                  />
                  <MetricRow
                    label="Toplam ciro"
                    value={formatCurrency(musteri.toplam_tutar)}
                    strong
                  />
                  <MetricRow
                    label="Toplam ağırlık"
                    value={formatKg(musteri.toplam_agirlik)}
                  />
                  <MetricRow
                    label="Müşteri durumu"
                    value={musteri.durum ?? "—"}
                  />
                  <MetricRow label="Rut" value={musteri.rut_kod ?? "—"} />
                  {musteri.geocode_hassasiyet && (
                    <MetricRow
                      label="Konum"
                      value={HASSASIYET_LABELS[musteri.geocode_hassasiyet]}
                    />
                  )}
                </dl>
              </motion.div>
            ) : (
              <motion.div
                key="ritim"
                ref={pageMeasureRef}
                custom={pageDirection}
                variants={pageSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageSlideTransition}
                className="absolute inset-x-0 top-0 w-full px-4 py-3.5"
              >
                <DegisimPage
                  musteri={musteri}
                  snapshot={snapshot}
                  loading={snapLoading}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="shrink-0 border-t bg-muted/30 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={!musteri.rut_kod}
          onClick={() => musteri.rut_kod && onShowRoute(musteri.rut_kod)}
        >
          Rotada göster
        </Button>
      </div>
    </motion.div>
  );
}

function DegisimPage({
  musteri,
  snapshot,
  loading,
}: {
  musteri: MusteriHarita;
  snapshot: MusteriSnapshotRow | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        Ritim yükleniyor…
      </p>
    );
  }

  const onceki: SnapshotMetrics | null =
    snapshot?.onceki_risk_durumu != null
      ? {
          risk_durumu: snapshot.onceki_risk_durumu,
          toplam_teslimat_sayisi: snapshot.onceki_toplam_teslimat_sayisi ?? 0,
          toplam_tutar: Number(snapshot.onceki_toplam_tutar ?? 0),
          toplam_agirlik: Number(snapshot.onceki_toplam_agirlik ?? 0),
          son_teslimattan_gecen_gun: snapshot.onceki_son_teslimattan_gecen_gun,
          son_teslimat_tarihi: snapshot.onceki_son_teslimat_tarihi,
        }
      : null;

  const yeni: SnapshotMetrics = snapshot
    ? {
        risk_durumu: snapshot.risk_durumu,
        toplam_teslimat_sayisi: snapshot.toplam_teslimat_sayisi,
        toplam_tutar: Number(snapshot.toplam_tutar),
        toplam_agirlik: Number(snapshot.toplam_agirlik),
        son_teslimattan_gecen_gun: snapshot.son_teslimattan_gecen_gun,
        son_teslimat_tarihi: snapshot.son_teslimat_tarihi,
      }
    : {
        risk_durumu: musteri.risk_durumu,
        toplam_teslimat_sayisi: musteri.toplam_teslimat_sayisi,
        toplam_tutar: musteri.toplam_tutar,
        toplam_agirlik: musteri.toplam_agirlik,
        son_teslimattan_gecen_gun: musteri.son_teslimattan_gecen_gun,
        son_teslimat_tarihi: musteri.son_teslimat_tarihi,
      };

  const sonuc = evaluateMusteriForm(onceki, yeni);
  const formColor = FORM_COLORS[sonuc.form];
  const olayColor = OLAY_COLORS[sonuc.olay];
  const mesafe = esigeKalanGun(yeni.son_teslimattan_gecen_gun);
  const bandDegisti =
    onceki != null && onceki.risk_durumu !== yeni.risk_durumu;

  if (!onceki) {
    return (
      <div className="space-y-3.5">
        <FormHeader sonuc={sonuc} formColor={formColor} olayColor={olayColor} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Henüz önceki sevkiyat yüklemesi yok. Bir{" "}
          <span className="text-foreground">SevkiyatRaporuKup</span> dosyası
          yükledikten sonra kazanım / uyarı / aksiyon olayları burada görünür.
        </p>
        <BaskiBar baski={sonuc.baski} color={formColor} />
        <dl className="flex flex-col gap-2 text-xs">
          <MetricRow
            label="Son teslimat"
            value={formatDate(yeni.son_teslimat_tarihi)}
            strong
          />
          {musteri.ilk_teslimat_tarihi && (
            <MetricRow
              label="İlk teslimat"
              value={formatDate(musteri.ilk_teslimat_tarihi)}
            />
          )}
          {yeni.son_teslimattan_gecen_gun != null && (
            <MetricRow
              label="Geçen gün"
              value={`${formatNumber(yeni.son_teslimattan_gecen_gun)} gün`}
            />
          )}
        </dl>
        {mesafe != null && (
          <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Eşiğe {formatNumber(mesafe.kalan)} gün · hedef {mesafe.hedef}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <FormHeader sonuc={sonuc} formColor={formColor} olayColor={olayColor} />
      <BaskiBar baski={sonuc.baski} color={formColor} />
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {sonuc.mesaj}
        {sonuc.xp > 0 ? ` · +${sonuc.xp} XP` : ""}
        {sonuc.streak > 0 ? ` · streak ${sonuc.streak}` : ""}
      </p>

      {bandDegisti && (
        <RiskMiniBar
          onceki={onceki.risk_durumu}
          yeni={yeni.risk_durumu}
          label="Risk geçişi"
        />
      )}

      <dl className="flex flex-col gap-2 text-xs">
        <MetricRow
          label="Son teslimat"
          value={formatDate(yeni.son_teslimat_tarihi)}
          strong
        />
        {onceki?.son_teslimat_tarihi &&
          onceki.son_teslimat_tarihi !== yeni.son_teslimat_tarihi && (
            <ChangeRow
              label="Önceki tarih"
              from={formatDate(onceki.son_teslimat_tarihi)}
              to={formatDate(yeni.son_teslimat_tarihi)}
            />
          )}
        <MetricRow
          label="Durum"
          value={`${FORM_LABELS[formDurumu(onceki)]} → ${FORM_LABELS[sonuc.form]}`}
        />
        <MetricRow
          label="Gün"
          value={
            mesafe != null
              ? `${formatNumber(yeni.son_teslimattan_gecen_gun ?? 0)} · eşiğe ${formatNumber(mesafe.kalan)}`
              : yeni.son_teslimattan_gecen_gun != null
                ? `${formatNumber(yeni.son_teslimattan_gecen_gun)} · eşik aşıldı`
                : "—"
          }
        />
        <ChangeRow
          label="Ciro"
          from={formatCurrency(onceki.toplam_tutar)}
          to={formatCurrency(yeni.toplam_tutar)}
          strong
        />
        <ChangeRow
          label="Teslimat"
          from={formatNumber(onceki.toplam_teslimat_sayisi)}
          to={formatNumber(yeni.toplam_teslimat_sayisi)}
        />
        <ChangeRow
          label="Ağırlık"
          from={formatKg(onceki.toplam_agirlik)}
          to={formatKg(yeni.toplam_agirlik)}
        />
      </dl>
    </div>
  );
}

function FormHeader({
  sonuc,
  formColor,
  olayColor,
}: {
  sonuc: ReturnType<typeof evaluateMusteriForm>;
  formColor: string;
  olayColor: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="inline-flex flex-col gap-0.5">
        <span
          className="font-mono text-[11px] tracking-wide uppercase"
          style={{ color: formColor }}
        >
          {FORM_LABELS[sonuc.form]}
        </span>
        <span
          className="font-mono text-[10px] tracking-wide uppercase"
          style={{ color: olayColor }}
        >
          {OLAY_LABELS[sonuc.olay]}
        </span>
      </span>
      <span
        className="font-mono text-lg font-semibold tabular-nums"
        style={{ color: formColor }}
      >
        %{Math.round(sonuc.baski * 100)}
      </span>
    </div>
  );
}

function BaskiBar({ baski, color }: { baski: number; color: string }) {
  return (
    <div>
      <SegmentBar
        segments={24}
        value={baski}
        color={color}
        label={`Baskı %${Math.round(baski * 100)} — eşiğe yaklaşma`}
      />
      <p className="mt-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        Baskı · eşiğe yaklaşma (ceza değil)
      </p>
    </div>
  );
}

/** RiskDagilim tarzı ayrık blok bar — önceki → yeni risk vurgusu. */
function RiskMiniBar({
  onceki,
  yeni,
  label,
}: {
  onceki: RiskDurumu | null;
  yeni: RiskDurumu;
  label: string;
}) {
  const TOTAL = 24;
  const colors: string[] = Array(TOTAL).fill("var(--secondary)");

  if (onceki && onceki !== yeni) {
    const half = Math.floor(TOTAL / 2);
    for (let i = 0; i < half; i++) colors[i] = RISK_COLORS[onceki];
    for (let i = half; i < TOTAL; i++) colors[i] = RISK_COLORS[yeni];
  } else {
    for (let i = 0; i < TOTAL; i++) colors[i] = RISK_COLORS[yeni];
  }

  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex gap-[2px]" role="img" aria-label={label}>
        {colors.map((color, i) => (
          <span
            key={i}
            className="h-1.5 min-w-0 flex-1 rounded-[1px] transition-colors duration-300 ease-out"
            style={{ backgroundColor: color, transitionDelay: `${i * 12}ms` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {RISK_ORDER.filter((r) => r === onceki || r === yeni).map((risk) => (
          <span
            key={risk}
            className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk] }}
            />
            {RISK_SHORT_LABELS[risk]}
            {onceki && onceki !== yeni
              ? risk === onceki
                ? " (önce)"
                : " (şimdi)"
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChangeRow({
  label,
  from,
  to,
  strong,
}: {
  label: string;
  from: string;
  to: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right font-mono tabular-nums",
          strong && "font-semibold"
        )}
      >
        <span className="text-muted-foreground">{from}</span>
        <span className="mx-1 text-muted-foreground/60">→</span>
        <span>{to}</span>
      </dd>
    </div>
  );
}

function computeAutoPosition({
  isCompact,
  anchor,
  containerW,
  containerH,
  panelHeight,
  panelWidth,
}: {
  isCompact: boolean;
  anchor: PanelAnchor;
  containerW: number;
  containerH: number;
  panelHeight: number;
  panelWidth: number;
}): { left: number; top: number } {
  if (isCompact) {
    return {
      left: EDGE_MARGIN,
      top: Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN),
    };
  }

  let left = anchor.x + ANCHOR_GAP;
  if (containerW > 0 && left + panelWidth + EDGE_MARGIN > containerW) {
    left = anchor.x - ANCHOR_GAP - panelWidth;
  }
  left = clamp(
    left,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, containerW - panelWidth - EDGE_MARGIN)
  );

  let top = anchor.y - panelHeight * 0.4;
  top = clamp(
    top,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN)
  );

  return { left, top };
}

function MetricRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          strong
            ? "truncate text-right font-mono font-semibold tabular-nums"
            : "truncate text-right font-mono tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
