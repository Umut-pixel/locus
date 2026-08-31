"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import {
  axisLabelWidth,
  clamp,
  closeToBaseline,
  formatAxisTRY,
  monotoneLine,
  niceDomain,
  pickTickIndices,
  type Pt,
} from "@/components/charts/chart-math";
import {
  ChartBrush,
  ChartBrushLayout,
  type BrushLayout,
} from "@/components/charts/ChartBrush";
import { PlotFrame, type PlotBox } from "@/components/charts/PlotFrame";
import { useChartSize } from "@/components/charts/useChartSize";
import { useCrosshair } from "@/components/charts/useCrosshair";
import type { TahsilatGunu } from "@/hooks/useTahsilatRaporu";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TahsilatTrendiProps {
  gunler: TahsilatGunu[];
  loading: boolean;
}

const PAD = { top: 18, right: 16, bottom: 28 };
/** Bölüm iç kenar boşluğu (px-3.5) — şerit hizası için gerekiyor. */
const SECTION_PAD = 14;

/** Sol eksen oluğu — en uzun tick etiketine göre. */
function yGutter(ticks: number[]): number {
  return Math.max(38, axisLabelWidth(ticks.map(formatAxisTRY)) + 14);
}

const STRIP_H = 64;
const STRIP_VB_W = 640;
const STRIP_PAD = { top: 8, right: 0, bottom: 6, left: 0 };
const STRIP_PLOT_W = STRIP_VB_W - STRIP_PAD.left - STRIP_PAD.right;
const STRIP_PLOT_H = STRIP_H - STRIP_PAD.top - STRIP_PAD.bottom;

const STROKE = "var(--chart-1)";

const kisaTarih = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Istanbul",
});

/**
 * Günlük ödenen tahsilat — ana grafik fırçayla seçilen pencereyi gösterir,
 * alt şerit tüm dönemi.
 *
 * Ana grafik gerçek piksel uzayında çiziliyor; yükseklik genişlikten
 * türetiliyor. Fırça sürüklenirken y ekseni hedef alan adıma doğru
 * yumuşatılıyor — ölçek zıplamıyor, etiketler yerlerine kayıyor.
 */
export function TahsilatTrendi({ gunler, loading }: TahsilatTrendiProps) {
  return (
    <section className="flex min-w-0 flex-col border-b border-border">
      {gunler.length < 2 ? (
        <>
          <TrendHeader toplam={0} bas={null} son={null} loading={loading} />
          <div
            className={cn(
              "flex min-h-[12.5rem] items-center justify-center px-3.5 py-3 text-[13px] text-muted-foreground",
              loading && "opacity-40"
            )}
          >
            Bu pencerede yeterli günlük veri yok.
          </div>
        </>
      ) : (
        <ChartBrushLayout
          pointCount={gunler.length}
          enabled
          height={STRIP_H}
          className={cn("min-w-0 transition-opacity", loading && "opacity-40")}
          brushStrip={(layout) => <BrushStrip gunler={gunler} layout={layout} />}
        >
          {(layout) => (
            <ZoomedTrend gunler={gunler} layout={layout} loading={loading} />
          )}
        </ChartBrushLayout>
      )}
    </section>
  );
}

function ZoomedTrend({
  gunler,
  layout,
  loading,
}: {
  gunler: TahsilatGunu[];
  layout: BrushLayout;
  loading: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [band, setBand] = useState(0);

  // Başlık ve toplam, fırçanın gerçek (yuvarlanmış) gün seçimini gösterir.
  const lo = Math.min(layout.startIndex, layout.endIndex);
  const hi = Math.max(layout.startIndex, layout.endIndex);
  const visible = useMemo(() => gunler.slice(lo, hi + 1), [gunler, lo, hi]);
  const toplam = useMemo(
    () => visible.reduce((a, g) => a + g.tutar, 0),
    [visible]
  );

  // Çizim penceresi ise kesirli: gün gün zıplamak yerine sürekli kayıyor.
  const son = gunler.length - 1;
  const f0 = layout.renderSelection.start * son;
  const f1 = layout.renderSelection.end * son;

  const { ref, style: boyut, width, height, ready } = useChartSize<HTMLDivElement>({
    ratio: 0.24,
    minHeight: 200,
    maxHeight: 320,
  });

  const { ruleRef, dotRef, tipRef, move, hide } = useCrosshair(
    Boolean(reduced),
    ready
  );

  // Alan, çizilen pencereden hesaplanıyor (yuvarlanmış seçimden değil) ki
  // kayarken eğri kutunun dışına taşmasın. Nice-step değerleri sabit kaldığı
  // için tick etiketleri her karede titremiyor.
  const pencereMax = useMemo(() => {
    const a = Math.max(0, Math.floor(f0));
    const b = Math.min(son, Math.ceil(f1));
    return Math.max(1, ...gunler.slice(a, b + 1).map((g) => g.tutar));
  }, [gunler, f0, f1, son]);
  const hedef = useMemo(() => niceDomain(0, pencereMax, 4), [pencereMax]);
  const olcek = useTweenedDomain(hedef.min, hedef.max, Boolean(reduced));

  const geo = useMemo(
    () => buildGeometry(gunler, f0, f1, hedef.ticks, olcek, width, height),
    [gunler, f0, f1, hedef.ticks, olcek, width, height]
  );

  const clipRef = useRef<SVGRectElement>(null);
  const inkRef = useRef<SVGGElement>(null);
  const frameRef = useRef<SVGGElement>(null);
  const veriAnahtarRef = useRef("");

  const plotWidth = geo?.plot.width ?? 0;
  const veriAnahtar = `${gunler.length}|${gunler[0]?.tarih ?? ""}|${gunler[gunler.length - 1]?.tarih ?? ""}`;

  useLayoutEffect(() => {
    if (!ready || plotWidth <= 0) return;
    const clip = clipRef.current;
    const ink = inkRef.current;
    const frame = frameRef.current;
    if (!clip || !ink || !frame) return;

    const yeniVeri = veriAnahtar !== veriAnahtarRef.current;
    veriAnahtarRef.current = veriAnahtar;

    if (!yeniVeri || reduced) {
      gsap.set(clip, { attr: { width: plotWidth } });
      gsap.set(ink, { autoAlpha: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      const rows = frame.querySelectorAll<SVGGElement>(".chart-axis-row");
      gsap.set(clip, { attr: { width: 0 } });
      gsap.set(ink, { autoAlpha: 0 });

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          rows,
          { autoAlpha: 0, x: -6 },
          { autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.05 },
          0
        )
        .to(ink, { autoAlpha: 1, duration: 0.3 }, 0.1)
        .to(clip, { attr: { width: plotWidth }, duration: 1, ease: "power3.out" }, 0.1);
    }, ref);

    return () => ctx.revert();
  }, [veriAnahtar, plotWidth, ready, reduced, ref]);

  // `band` artık global gün indeksi — pencere kaydıkça tooltip aynı günde kalır.
  const aktif = gunler[clamp(band, 0, son)] ?? null;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!geo) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const t = (event.clientX - rect.left - geo.plot.left) / geo.plot.width;
    const i = clamp(Math.round(f0 + t * (f1 - f0)), 0, son);
    setBand(i);
    const gun = gunler[i];
    if (!gun) return;
    move(geo.xAt(i), geo.yAt(gun.tutar), rect.width);
  };

  return (
    <>
      <TrendHeader
        toplam={toplam}
        bas={visible[0]?.tarih ?? null}
        son={visible[visible.length - 1]?.tarih ?? null}
        loading={loading}
      />
      <div className="px-3.5 pt-3 pb-1">
        <div
          ref={ref}
          className="relative min-w-0"
          style={{ ...boyut, cursor: "crosshair", touchAction: "pan-y" }}
          onPointerMove={onPointerMove}
          onPointerLeave={hide}
        >
          {geo ? (
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              className="block"
              role="img"
              aria-label={`Günlük ödenen tahsilat, seçili aralık ${formatCurrency(toplam)}`}
            >
              <defs>
                <clipPath id={`${uid}-reveal`}>
                  <rect
                    ref={clipRef}
                    x={geo.plot.left}
                    y={0}
                    width={geo.plot.width}
                    height={height}
                  />
                </clipPath>
                <linearGradient
                  id={`${uid}-fill`}
                  gradientUnits="userSpaceOnUse"
                  x1={0}
                  y1={geo.plot.top}
                  x2={0}
                  y2={geo.plot.bottom}
                >
                  <stop offset={0} stopColor={STROKE} stopOpacity={0.24} />
                  <stop offset={1} stopColor={STROKE} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <g ref={frameRef}>
                <PlotFrame
                  plot={geo.plot}
                  yTicks={geo.yTicks}
                  yAt={geo.yAt}
                  xTicks={geo.xTicks}
                />
              </g>

              <g ref={inkRef} clipPath={`url(#${uid}-reveal)`}>
                <path d={geo.area} fill={`url(#${uid}-fill)`} stroke="none" />
                <path
                  d={geo.line}
                  fill="none"
                  stroke={STROKE}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>

              <g ref={ruleRef} pointerEvents="none">
                <line
                  x1={0}
                  x2={0}
                  y1={geo.plot.top}
                  y2={geo.plot.bottom}
                  stroke="var(--foreground)"
                  strokeOpacity={0.34}
                  strokeWidth={1}
                />
              </g>
              <g ref={dotRef} pointerEvents="none">
                <circle
                  r={4.5}
                  fill={STROKE}
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              </g>
            </svg>
          ) : null}

          <div ref={tipRef} className="pointer-events-none absolute top-1 left-0 z-10">
            <div className="insight-chart-tooltip">
              <span className="text-[12px] font-medium text-foreground">
                {aktif ? formatDate(aktif.tarih) : "—"}
              </span>
              <span className="insight-chart-tooltip-item">
                <span
                  className="insight-chart-tooltip-dot"
                  style={{ background: STROKE }}
                />
                {formatCurrency(aktif?.tutar ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function BrushStrip({
  gunler,
  layout,
}: {
  gunler: TahsilatGunu[];
  layout: BrushLayout;
}) {
  const uid = useId().replace(/:/g, "");

  // Şerit, üstteki plot alanıyla aynı hizada başlasın: y ekseni oluğu ne kadar
  // genişse şeridi de o kadar içeri al.
  const lo = Math.min(layout.startIndex, layout.endIndex);
  const hi = Math.max(layout.startIndex, layout.endIndex);
  const gutter =
    SECTION_PAD +
    yGutter(
      niceDomain(0, Math.max(1, ...gunler.slice(lo, hi + 1).map((g) => g.tutar)), 4)
        .ticks
    );

  const max = Math.max(1, ...gunler.map((g) => g.tutar));
  const n = gunler.length;
  const stepX = n > 1 ? STRIP_PLOT_W / (n - 1) : 0;
  const pts: Pt[] = gunler.map((g, i) => ({
    x: STRIP_PAD.left + (n > 1 ? i * stepX : STRIP_PLOT_W / 2),
    y: STRIP_PAD.top + (1 - g.tutar / max) * STRIP_PLOT_H,
  }));
  const line = monotoneLine(pts);
  const area = closeToBaseline(line, pts, STRIP_PAD.top + STRIP_PLOT_H);
  const minSpan =
    Math.max(2, Math.min(7, Math.round(n * 0.05))) / Math.max(1, n - 1);

  return (
    <div className="relative h-full border-t border-border/60">
      <div
        className="relative h-full"
        style={{ marginLeft: gutter, marginRight: SECTION_PAD + PAD.right }}
      >
        <svg
          viewBox={`0 0 ${STRIP_VB_W} ${STRIP_H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden
        >
          <defs>
            <linearGradient
              id={`${uid}-strip`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={STRIP_PAD.top}
              x2={0}
              y2={STRIP_PAD.top + STRIP_PLOT_H}
            >
              <stop offset={0} stopColor={STROKE} stopOpacity={0.18} />
              <stop offset={1} stopColor={STROKE} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {area ? <path d={area} fill={`url(#${uid}-strip)`} stroke="none" /> : null}
          {line ? (
            <path
              d={line}
              fill="none"
              stroke={STROKE}
              strokeWidth={1.25}
              strokeOpacity={0.85}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <div
          className="absolute inset-x-0"
          style={{
            top: `${(STRIP_PAD.top / STRIP_H) * 100}%`,
            bottom: `${(STRIP_PAD.bottom / STRIP_H) * 100}%`,
          }}
        >
          <ChartBrush
            selection={layout.selection}
            renderSelection={layout.renderSelection}
            onSelectionChange={layout.onBrushSelectionChange}
            minSpan={minSpan}
          />
        </div>
      </div>
    </div>
  );
}

function TrendHeader({
  toplam,
  bas,
  son,
  loading,
}: {
  toplam: number;
  bas: string | null;
  son: string | null;
  loading: boolean;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
      <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        Günlük nakit trendi
      </h2>
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 transition-opacity",
          loading && "opacity-40"
        )}
      >
        {bas && son ? (
          <span className="hidden text-[11.5px] text-muted-foreground sm:inline">
            {kisaTarih.format(isoGun(bas))} – {kisaTarih.format(isoGun(son))}
          </span>
        ) : null}
        <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
          {formatCurrency(toplam)}
          <span className="ml-1.5 font-sans text-[11.5px] font-normal text-muted-foreground">
            ödenen
          </span>
        </span>
      </div>
    </header>
  );
}

type TahsilatNokta = Pt & { gun: TahsilatGunu };

type TahsilatGeometri = {
  plot: PlotBox;
  line: string;
  area: string;
  yTicks: number[];
  yAt: (v: number) => number;
  xAt: (index: number) => number;
  xTicks: { x: number; label: string }[];
};

/**
 * Sürekli x ölçeği: pencere kesirli olduğu için eğri gün adımlarıyla
 * zıplamadan kayıyor. Pencere kenarının bir dışındaki noktalar da çiziliyor;
 * eğri plot'a kesilmeden girip çıksın diye (yatay kırpma clipPath'te).
 */
function buildGeometry(
  gunler: TahsilatGunu[],
  f0: number,
  f1: number,
  ticks: number[],
  olcek: { min: number; max: number },
  width: number,
  height: number
): TahsilatGeometri | null {
  // NaN <= 8 false döner; ölçüm gelmeden path üretmemek için sonluluk da şart.
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 8 || height <= 8 || gunler.length === 0) return null;

  const left = yGutter(ticks);
  const plotWidth = Math.max(1, width - left - PAD.right);
  const plotHeight = Math.max(1, height - PAD.top - PAD.bottom);
  const plot: PlotBox = {
    left,
    top: PAD.top,
    width: plotWidth,
    height: plotHeight,
    right: left + plotWidth,
    bottom: PAD.top + plotHeight,
  };

  const range = olcek.max - olcek.min || 1;
  const yAt = (v: number) =>
    plot.top + (1 - (v - olcek.min) / range) * plot.height;

  const span = Math.max(1e-6, f1 - f0);
  const xAt = (index: number) => plot.left + ((index - f0) / span) * plot.width;

  const son = gunler.length - 1;
  const cizimLo = Math.max(0, Math.floor(f0) - 1);
  const cizimHi = Math.min(son, Math.ceil(f1) + 1);
  const pts: TahsilatNokta[] = [];
  for (let i = cizimLo; i <= cizimHi; i += 1) {
    const gun = gunler[i];
    if (gun) pts.push({ x: xAt(i), y: yAt(gun.tutar), gun });
  }

  const line = monotoneLine(pts);

  // Etiketler pencere içinde kalan tam günlerden seçiliyor.
  const etiketLo = Math.max(0, Math.ceil(f0));
  const etiketHi = Math.min(son, Math.floor(f1));
  const etiketAdet = Math.max(0, etiketHi - etiketLo + 1);

  return {
    plot,
    line,
    area: closeToBaseline(line, pts, plot.bottom),
    // Geçiş sırasında plot dışına taşan tick'i çizme.
    yTicks: ticks.filter((v) => {
      const y = yAt(v);
      return y >= plot.top - 0.5 && y <= plot.bottom + 0.5;
    }),
    yAt,
    xAt,
    xTicks: pickTickIndices(etiketAdet, plotWidth).map((k) => {
      const i = etiketLo + k;
      return { x: xAt(i), label: kisaTarih.format(isoGun(gunler[i]!.tarih)) };
    }),
  };
}

/**
 * Hedef alana doğru yumuşatılmış ölçek. Fırça sürüklenirken tween hedefi
 * yenilenir; eğri sıçramak yerine yeni yüksekliğine akar.
 */
function useTweenedDomain(min: number, max: number, reduced: boolean) {
  const [olcek, setOlcek] = useState({ min, max });
  const proxyRef = useRef({ min, max });

  useLayoutEffect(() => {
    if (reduced) {
      proxyRef.current = { min, max };
      return;
    }
    const proxy = proxyRef.current;
    const tween = gsap.to(proxy, {
      min,
      max,
      duration: 0.34,
      ease: "power3.out",
      overwrite: true,
      onUpdate: () => setOlcek({ min: proxy.min, max: proxy.max }),
    });
    return () => {
      tween.kill();
    };
  }, [min, max, reduced]);

  return reduced ? { min, max } : olcek;
}

function isoGun(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12));
}
