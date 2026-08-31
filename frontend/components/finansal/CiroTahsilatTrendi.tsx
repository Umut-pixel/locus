"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

import {
  axisLabelWidth,
  closeToBaseline,
  clamp,
  formatAxisTRY,
  monotoneLine,
  niceDomain,
  pickTickIndices,
  type Pt,
} from "@/components/charts/chart-math";
import { PlotFrame, type PlotBox } from "@/components/charts/PlotFrame";
import { useChartSize } from "@/components/charts/useChartSize";
import { useCrosshair } from "@/components/charts/useCrosshair";
import type { CiroGunu } from "@/hooks/useFinansalRaporu";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CiroTahsilatTrendiProps {
  gunler: CiroGunu[];
  loading: boolean;
}

const PROFIT = "var(--color-emerald-500)";
const LOSS = "var(--color-red-500)";

/** Sol oluk eksen etiketine göre ölçülüyor; üst/alt sabit. */
const PAD = { top: 20, right: 16, bottom: 30 };

const kisaTarih = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Istanbul",
});

/**
 * Günlük net ciro — kâr/zarar eğrisi.
 *
 * Grafik gerçek piksel uzayında çiziliyor (esnetilmiş viewBox değil), yükseklik
 * genişliğe oranla hesaplanıyor; böylece geniş ekranda ince bir şerit yerine
 * dengeli bir alan kalıyor. Kâr/zarar ayrımı, sıfır çizgisinde sert duraklı bir
 * gradyanla yapılıyor — eğriyi parçalara bölmeye gerek kalmıyor.
 */
export function CiroTahsilatTrendi({ gunler, loading }: CiroTahsilatTrendiProps) {
  const toplam = useMemo(
    () => gunler.reduce((a, g) => a + g.netCiro, 0),
    [gunler]
  );

  return (
    <section className="flex min-w-0 flex-col border-b border-border">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Ciro trendi
        </h2>
        <div className="flex min-w-0 items-center gap-3">
          <ProfitLossLegend />
          <span
            className={cn(
              "font-mono text-[12.5px] font-medium tabular-nums",
              toplam < 0 ? "text-red-500" : "text-foreground"
            )}
          >
            {formatCurrency(toplam)}
            <span className="ml-1.5 font-sans text-[11.5px] font-normal text-muted-foreground">
              net
            </span>
          </span>
        </div>
      </header>

      <div className={cn("px-3.5 py-4 transition-opacity", loading && "opacity-40")}>
        {gunler.length < 2 ? (
          <div className="flex h-64 items-center justify-center text-[13px] text-muted-foreground">
            Bu pencerede yeterli günlük veri yok.
          </div>
        ) : (
          <CiroTrendPlot gunler={gunler} toplam={toplam} />
        )}
      </div>
    </section>
  );
}

function CiroTrendPlot({ gunler, toplam }: { gunler: CiroGunu[]; toplam: number }) {
  const uid = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [band, setBand] = useState(0);

  const { ref, style: boyut, width, height, ready } = useChartSize<HTMLDivElement>({
    ratio: 0.3,
    minHeight: 260,
    maxHeight: 400,
  });

  const { ruleRef, dotRef, tipRef, move, hide } = useCrosshair(
    Boolean(reduced),
    ready
  );

  const geo = useMemo(
    () => buildGeometry(gunler, width, height),
    [gunler, width, height]
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

    // Açılış yalnızca yeni veride oynar; yeniden boyutlanmada sadece eşitlenir.
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
          { autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.045 },
          0
        )
        .to(ink, { autoAlpha: 1, duration: 0.3 }, 0.12)
        .to(clip, { attr: { width: plotWidth }, duration: 1.05 }, 0.12);
    }, ref);

    return () => ctx.revert();
  }, [veriAnahtar, plotWidth, ready, reduced, ref]);

  if (!geo) {
    return <div ref={ref} className="min-w-0" style={boyut} />;
  }

  const { plot, pts, line, area, zeroY, zeroT, yTicks, yAt, xTicks } = geo;
  const aktif = pts[clamp(band, 0, pts.length - 1)]!;
  const hoverRenk = aktif.v >= 0 ? PROFIT : LOSS;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = (event.clientX - rect.left - plot.left) / plot.width;
    const i = clamp(Math.round(t * (pts.length - 1)), 0, pts.length - 1);
    setBand(i);
    const p = pts[i]!;
    move(p.x, p.y, rect.width);
  };

  return (
    <div
      ref={ref}
      className="relative min-w-0"
      style={{ ...boyut, cursor: "crosshair", touchAction: "pan-y" }}
      onPointerMove={onPointerMove}
      onPointerLeave={hide}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label={`Günlük net ciro kâr/zarar trendi, toplam ${formatCurrency(toplam)}`}
      >
        <defs>
          <clipPath id={`${uid}-reveal`}>
            <rect ref={clipRef} x={plot.left} y={0} width={plot.width} height={height} />
          </clipPath>
          <linearGradient
            id={`${uid}-stroke`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={plot.top}
            x2={0}
            y2={plot.bottom}
          >
            <stop offset={zeroT} stopColor={PROFIT} />
            <stop offset={zeroT} stopColor={LOSS} />
          </linearGradient>
          <linearGradient
            id={`${uid}-fill`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={plot.top}
            x2={0}
            y2={plot.bottom}
          >
            <stop offset={0} stopColor={PROFIT} stopOpacity={0.22} />
            <stop offset={zeroT} stopColor={PROFIT} stopOpacity={0.02} />
            <stop offset={zeroT} stopColor={LOSS} stopOpacity={0.02} />
            <stop offset={1} stopColor={LOSS} stopOpacity={0.22} />
          </linearGradient>
        </defs>

        <g ref={frameRef}>
          <PlotFrame
            plot={plot}
            yTicks={yTicks}
            yAt={yAt}
            xTicks={xTicks}
            zeroY={zeroY}
          />
        </g>

        <g ref={inkRef} clipPath={`url(#${uid}-reveal)`}>
          <path d={area} fill={`url(#${uid}-fill)`} stroke="none" />
          <path
            d={line}
            fill="none"
            stroke={`url(#${uid}-stroke)`}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>

        <g ref={ruleRef} pointerEvents="none">
          <line
            x1={0}
            x2={0}
            y1={plot.top}
            y2={plot.bottom}
            stroke="var(--foreground)"
            strokeOpacity={0.34}
            strokeWidth={1}
          />
        </g>
        <g ref={dotRef} pointerEvents="none">
          <circle
            r={4.5}
            fill={hoverRenk}
            stroke="var(--background)"
            strokeWidth={2}
            style={{ transition: "fill 220ms ease" }}
          />
        </g>
      </svg>

      <div ref={tipRef} className="pointer-events-none absolute top-1 left-0 z-10">
        <div className="insight-chart-tooltip">
          <span className="text-[12px] font-medium text-foreground">
            {formatDate(aktif.gun.tarih)}
          </span>
          <span className="insight-chart-tooltip-item">
            <span
              className="insight-chart-tooltip-dot"
              style={{ background: hoverRenk }}
            />
            {aktif.v >= 0 ? "Kâr" : "Zarar"} {formatCurrency(aktif.v)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProfitLossLegend() {
  return (
    <span className="hidden items-center gap-2.5 sm:flex" aria-hidden>
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Kâr
      </span>
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-red-500" />
        Zarar
      </span>
    </span>
  );
}

type CiroNokta = Pt & { v: number; gun: CiroGunu };

type CiroGeometri = {
  plot: PlotBox;
  pts: CiroNokta[];
  line: string;
  area: string;
  zeroY: number;
  zeroT: number;
  yTicks: number[];
  yAt: (v: number) => number;
  xTicks: { x: number; label: string }[];
};

function buildGeometry(
  gunler: CiroGunu[],
  width: number,
  height: number
): CiroGeometri | null {
  // NaN <= 8 false döner; ölçüm gelmeden path üretmemek için sonluluk da şart.
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 8 || height <= 8 || gunler.length < 2) return null;

  const degerler = gunler.map((g) => g.netCiro);
  const { min, max, ticks } = niceDomain(
    Math.min(0, ...degerler),
    Math.max(0, ...degerler),
    4
  );

  const left = Math.max(38, axisLabelWidth(ticks.map(formatAxisTRY)) + 14);
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

  const range = max - min || 1;
  const yAt = (v: number) => plot.top + (1 - (v - min) / range) * plot.height;
  const step = plotWidth / (gunler.length - 1);

  const pts: CiroNokta[] = gunler.map((gun, i) => ({
    x: plot.left + i * step,
    y: yAt(gun.netCiro),
    v: gun.netCiro,
    gun,
  }));

  const zeroY = yAt(0);
  const line = monotoneLine(pts);

  return {
    plot,
    pts,
    line,
    area: closeToBaseline(line, pts, zeroY),
    zeroY,
    zeroT: clamp((zeroY - plot.top) / plot.height, 0, 1),
    yTicks: ticks,
    yAt,
    xTicks: pickTickIndices(pts.length, plotWidth).map((i) => {
      const p = pts[i]!;
      return { x: p.x, label: kisaTarih.format(isoGun(p.gun.tarih)) };
    }),
  };
}

function isoGun(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12));
}
