"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { XIcon } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { SegmentBar } from "@/components/ui/segment-bar";
import { formatCurrency, formatDate, formatKg, formatNumber } from "@/lib/format";
import { HASSASIYET_LABELS, RISK_COLORS, RISK_LABELS } from "@/lib/risk-style";
import type { MusteriHarita } from "@/lib/types";

const GECIKME_ESIK_GUN = 90;
const PANEL_WIDTH = 304;
const ANCHOR_GAP = 18;
const EDGE_MARGIN = 12;

export interface PanelAnchor {
  /** Harita container'ına göre piksel konumu (seçili noktanın merkezi). */
  x: number;
  y: number;
  /**
   * true → güncelleme pan/zoom kaynaklı; panel noktayı animasyonsuz,
   * birebir takip eder. false → nokta seçimi; konum geçişi spring ile.
   */
  instant: boolean;
}

interface CustomerDetailPanelProps {
  musteri: MusteriHarita;
  anchor: PanelAnchor;
  /** Panelin içinde konumlandığı harita alanı — sınır kontrolü için. */
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
  const [panelHeight, setPanelHeight] = useState(380);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => setPanelHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  // Tercihen noktanın sağı; sığmazsa sola çevir, her durumda kenara kelepçele.
  let left = anchor.x + ANCHOR_GAP;
  if (containerW > 0 && left + PANEL_WIDTH + EDGE_MARGIN > containerW) {
    left = anchor.x - ANCHOR_GAP - PANEL_WIDTH;
  }
  left = clamp(left, EDGE_MARGIN, Math.max(EDGE_MARGIN, containerW - PANEL_WIDTH - EDGE_MARGIN));

  let top = anchor.y - panelHeight * 0.4;
  top = clamp(top, EDGE_MARGIN, Math.max(EDGE_MARGIN, containerH - panelHeight - EDGE_MARGIN));

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
        layout: anchor.instant
          ? { duration: 0 }
          : { type: "spring", stiffness: 380, damping: 34 },
      }}
      style={{ left, top, width: PANEL_WIDTH }}
      className="pointer-events-auto absolute z-20 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
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
          aria-label="Paneli kapat"
          className="-mt-1 -mr-1.5 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
        <MetricRow label="Toplam ağırlık" value={formatKg(musteri.toplam_agirlik)} />
        <MetricRow label="Rut" value={musteri.rut_kod ?? "—"} />
        {musteri.geocode_hassasiyet && (
          <MetricRow
            label="Konum"
            value={HASSASIYET_LABELS[musteri.geocode_hassasiyet]}
          />
        )}
      </dl>

      <div className="border-t bg-muted/30 px-4 py-3">
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
