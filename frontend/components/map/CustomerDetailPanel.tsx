"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { GripHorizontalIcon, XIcon } from "lucide-react";
import { motion, useDragControls, useMotionValue } from "motion/react";

import { Button } from "@/components/ui/button";
import { SegmentBar } from "@/components/ui/segment-bar";
import { formatCurrency, formatDate, formatKg, formatNumber } from "@/lib/format";
import { HASSASIYET_LABELS, RISK_COLORS, RISK_LABELS } from "@/lib/risk-style";
import type { MusteriHarita } from "@/lib/types";
import { cn } from "@/lib/utils";

const GECIKME_ESIK_GUN = 90;
const PANEL_WIDTH = 304;
const ANCHOR_GAP = 18;
const EDGE_MARGIN = 12;
const COMPACT_BREAKPOINT = 640;

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
  const draggedRef = useRef(false);
  const dragControls = useDragControls();
  const [panelHeight, setPanelHeight] = useState(380);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => setPanelHeight(el.offsetHeight);
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

  // Sticky: seçim konumuna yerleştir; sürüklenmedikçe harita hareketinden etkilenmez.
  useLayoutEffect(() => {
    if (draggedRef.current) return;
    if (containerW <= 0 || containerH <= 0) return;

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
      ? Math.min(Math.round((gecikmeGun / GECIKME_ESIK_GUN) * 100), 999)
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
              : `Son teslimat ${formatNumber(gecikmeGun)} gün önce · eşik ${GECIKME_ESIK_GUN} gün`}
          </p>
        </div>

        <div className="mx-4 mt-3.5 border-t" />

        <dl className="flex flex-col gap-2 px-4 py-3.5 text-xs">
          <MetricRow label="Müşteri durumu" value={musteri.durum ?? "—"} />
          <MetricRow
            label="Toplam ciro"
            value={formatCurrency(musteri.toplam_tutar)}
            strong
          />
          <MetricRow
            label="Son teslimat"
            value={formatDate(musteri.son_teslimat_tarihi)}
          />
          <MetricRow
            label="Teslimat sayısı"
            value={formatNumber(musteri.toplam_teslimat_sayisi)}
          />
          <MetricRow
            label="Toplam ağırlık"
            value={formatKg(musteri.toplam_agirlik)}
          />
          <MetricRow label="Rut" value={musteri.rut_kod ?? "—"} />
          {musteri.geocode_hassasiyet && (
            <MetricRow
              label="Konum"
              value={HASSASIYET_LABELS[musteri.geocode_hassasiyet]}
            />
          )}
        </dl>
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
