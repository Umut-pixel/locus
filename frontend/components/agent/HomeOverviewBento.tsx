"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { IlceBarChart } from "@/components/agent/IlceBarChart";
import { BorcRiskAreaChart } from "@/components/agent/BorcRiskAreaChart";
import { LinearGauge } from "@/components/agent/LinearGauge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useHomeOverview,
  type HomeDurumSlice,
  type HomeIlceSlice,
  type HomeOverview,
  type HomeRiskSlice,
  type HomeSevkSatiri,
  type HomeBorcBant,
} from "@/hooks/useHomeOverview";
import { useAgentRuntimeStatus } from "@/hooks/useAgentRuntimeStatus";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import { clipAgentError } from "@/lib/agent-status";
import { formatCurrency, formatNumber } from "@/lib/format";
import { formatIstanbulStamp } from "@/lib/panorama-schedule";
import { RISK_COLORS } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

const STATUS_ROTATE_MS = 7000;
const STATUS_FACE_EASE = [0.16, 1, 0.3, 1] as const;

const DURUM_RENK: Record<HomeDurumSlice["ad"], string> = {
  Aktif: "var(--chart-3)",
  Pasif: "var(--muted-foreground)",
  İptal: "var(--destructive)",
  Diğer: "var(--chart-5)",
};

export function HomeOverviewBento({
  onAsk,
}: {
  onAsk: (prompt: string) => void;
}) {
  const { data, loading, error, refresh } = useHomeOverview(true);
  const sync = usePanoramaSyncStatus();

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6" data-overview={loading ? "loading" : "ready"}>
      {error ? (
        <div className="col-span-2 rounded-[14px] border border-line bg-card px-3 py-2.5 shadow-agent md:col-span-4">
          <p className="text-[13px] text-ink">Özet yüklenemedi.</p>
          <p className="mt-0.5 text-[12px] text-ink-3">{error}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-2 rounded-[8px] px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            Yeniden dene
          </button>
        </div>
      ) : loading && data.toplam === 0 ? (
        <PortfoySkeleton className="col-span-2 md:col-span-4" />
      ) : data.toplam === 0 ? (
        <div className="col-span-2 rounded-[14px] border border-line bg-card px-3 py-2.5 shadow-agent md:col-span-4">
          <p className="text-[13px] text-ink">Müşteri satırı yok.</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Panorama verisi gelince portföy, teslimat riski, son sevkiyat ve borç oranları burada açılır.
          </p>
        </div>
      ) : (
        <PortfoyTile
          className="col-span-2 md:col-span-4"
          overview={data}
          loading={loading}
          onAsk={onAsk}
        />
      )}
      <SyncTile
        className="col-span-2 md:col-span-2"
        label={sync.label}
        nextStamp={sync.nextStamp}
        loading={sync.loading}
        error={sync.status.syncError}
        pending={sync.status.transformPending}
      />
      {error || (loading && data.toplam === 0) ? (
        <>
          <RiskSkeleton className="col-span-2 md:col-span-2" />
          <IlceSkeleton className="col-span-2 md:col-span-4" />
          <SevkSkeleton className="col-span-2 md:col-span-2" />
          <BorcSkeleton className="col-span-2 md:col-span-4" />
        </>
      ) : (
        <>
          <RiskTile
            className="col-span-2 md:col-span-2"
            slices={data.risk}
            toplam={data.toplam}
            loading={loading}
            onAsk={onAsk}
          />
          <IlceTile
            className="col-span-2 md:col-span-4"
            slices={data.ilceler}
            loading={loading}
            onAsk={onAsk}
          />
          <SevkTile
            className="col-span-2 md:col-span-2"
            satirlar={data.sonSevk}
            loading={loading}
            onAsk={onAsk}
          />
          <BorcTile
            className="col-span-2 md:col-span-4"
            slices={data.borcRisk}
            bantlar={data.borcBantlar}
            loading={loading}
            onAsk={onAsk}
          />
        </>
      )}
    </div>
  );
}

function Tile({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & React.ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-[14px] border border-line bg-card p-2.5 shadow-agent",
        className
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

function PortfoyTile({
  className,
  overview,
  loading,
  onAsk,
}: {
  className?: string;
  overview: HomeOverview;
  loading: boolean;
  onAsk: (prompt: string) => void;
}) {
  const slices = overview.durum;
  const [secili, setSecili] = useState(slices[0]?.ad ?? "Aktif");
  const active = slices.find((s) => s.ad === secili) ?? slices[0];
  const toplam = slices.reduce((a, s) => a + s.sayi, 0) || 1;
  const pay = ((active?.sayi ?? 0) / toplam) * 100;
  const renk = DURUM_RENK[active?.ad ?? "Aktif"];

  return (
    <Tile className={className}>
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-medium text-ink">Portföy</h3>
        <p className="font-mono text-[11px] text-ink-3 tabular-nums">
          {formatCurrency(overview.netCiro)} net
        </p>
      </header>
      <p
        className={cn(
          "mt-1 text-[18px] font-semibold tracking-[-0.02em] text-ink tabular-nums",
          loading && "opacity-50"
        )}
      >
        {formatNumber(active?.sayi ?? overview.toplam)}
        <span className="ml-1.5 text-[12px] font-medium tracking-normal text-ink-3">
          {active?.ad ?? "müşteri"}
        </span>
      </p>
      <div className={cn("mt-2", loading && "opacity-50")}>
        <LinearGauge
          value={pay}
          totalNotches={64}
          spacing={16}
          notchCornerRadius={2}
          inactiveFillOpacity={0.35}
          activeFill={renk}
        />
      </div>
      <ul className="mt-2 flex flex-wrap gap-1">
        {slices.map((s) => (
          <li key={s.ad}>
            <button
              type="button"
              onClick={() => {
                if (secili === s.ad) onAsk(s.prompt);
                else setSecili(s.ad);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors",
                active?.ad === s.ad ? "bg-field text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
              )}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: DURUM_RENK[s.ad] }}
                aria-hidden
              />
              {s.ad}
              <span className="font-mono tabular-nums">{formatNumber(s.sayi)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function RiskTile({
  className,
  slices,
  toplam,
  loading,
  onAsk,
}: {
  className?: string;
  slices: HomeRiskSlice[];
  toplam: number;
  loading: boolean;
  onAsk: (prompt: string) => void;
}) {
  const taban = toplam || 1;

  return (
    <Tile className={className}>
      <h3 className="text-[12px] font-medium text-ink">Teslimat riski</h3>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div
          className={cn(
            "flex h-1.5 w-full overflow-hidden rounded-full bg-field",
            loading && "opacity-50"
          )}
        >
          {slices.map((s) => {
            const pay = s.sayi / taban;
            if (pay <= 0) return null;
            return (
              <div
                key={s.key}
                className="h-full transition-[width] duration-500 ease-out"
                style={{ width: `${pay * 100}%`, backgroundColor: RISK_COLORS[s.key] }}
              />
            );
          })}
        </div>
        <ul className="mt-2.5 flex flex-col gap-0.5">
          {slices.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onAsk(s.prompt)}
                className="flex w-full items-center gap-2 rounded-[8px] px-1 py-0.5 text-left transition-colors hover:bg-hover"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[s.key] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{s.ad}</span>
                <span className="font-mono text-[12px] text-ink tabular-nums">
                  {formatNumber(s.sayi)}
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">
                  %{Math.round((s.sayi / taban) * 100)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Tile>
  );
}

function IlceTile({
  className,
  slices,
  loading,
  onAsk,
}: {
  className?: string;
  slices: HomeIlceSlice[];
  loading: boolean;
  onAsk: (prompt: string) => void;
}) {
  return (
    <Tile className={className}>
      <h3 className="text-[12px] font-medium text-ink">Yoğun ilçeler</h3>
      <IlceBarChart
        data={slices.map((s) => ({
          ad: s.etiket,
          ciro: s.ciro,
          borc: s.borc,
          prompt: s.prompt,
        }))}
        loading={loading}
        onAsk={onAsk}
      />
    </Tile>
  );
}

function SevkTile({
  className,
  satirlar,
  loading,
  onAsk,
}: {
  className?: string;
  satirlar: HomeSevkSatiri[];
  loading: boolean;
  onAsk: (prompt: string) => void;
}) {
  return (
    <Tile className={className}>
      <h3 className="text-[12px] font-medium text-ink">Son sevk edilenler</h3>
      {satirlar.length === 0 ? (
        <p className={cn("mt-2 text-[12.5px] text-ink-3", loading && "opacity-50")}>
          Sevkiyat kaydı yok.
        </p>
      ) : (
        <ul className={cn("mt-1.5 flex flex-col", loading && "opacity-50")}>
          {satirlar.map((s) => {
            const [, m, d] = s.tarih.split("-");
            const gun = m && d ? `${d}/${m}` : s.tarih;
            return (
              <li key={s.belgeKod}>
                <button
                  type="button"
                  onClick={() => onAsk(s.prompt)}
                  className="flex w-full min-w-0 items-baseline gap-2 rounded-[8px] px-1 py-1 text-left transition-colors hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {s.musteriUnvani ?? s.musteriKodu ?? "—"}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink tabular-nums">
                    {formatCurrency(s.tutar)}
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">
                    {gun}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}

function BorcTile({
  className,
  slices,
  bantlar,
  loading,
  onAsk,
}: {
  className?: string;
  slices: HomeRiskSlice[];
  bantlar: HomeBorcBant[];
  loading: boolean;
  onAsk: (prompt: string) => void;
}) {
  const yasli = slices.filter((s) => s.key !== "hic_teslimat_yok");
  const taban = yasli.reduce((n, s) => n + s.sayi, 0) || 1;

  return (
    <Tile className={className}>
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-medium text-ink">Borç riski oranları</h3>
        <ul className="flex min-w-0 flex-wrap justify-end gap-x-2.5 gap-y-0.5">
          {yasli.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onAsk(s.prompt)}
                className="flex items-center gap-1.5 text-[11px] text-ink-2 transition-colors hover:text-ink"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[s.key] }}
                  aria-hidden
                />
                {s.ad}
                <span className="font-mono text-ink tabular-nums">
                  %{Math.round((s.sayi / taban) * 100)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </header>
      <BorcRiskAreaChart data={bantlar} loading={loading} onAsk={onAsk} />
    </Tile>
  );
}

type StatusTone = "ok" | "wait" | "warn";

type StatusFaceModel = {
  title: string;
  pill: string;
  tone: StatusTone;
  line: string;
  sub: string | null;
  loading?: boolean;
  liveLabel?: string | null;
};

function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  const pill =
    tone === "warn"
      ? "bg-red-tint text-ink-red"
      : tone === "wait"
        ? "bg-accent-tint text-ink-orange"
        : "bg-green-tint text-ink-green";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-medium",
        pill
      )}
    >
      {label}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="locus-live-dot" aria-hidden>
      <span />
    </span>
  );
}

function StatusFace({
  title,
  pill,
  tone,
  line,
  sub,
  loading,
  liveLabel,
}: StatusFaceModel) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium text-ink">{title}</h3>
        <StatusPill label={pill} tone={tone} />
      </header>
      <p
        className={cn(
          "text-[13px] leading-snug text-ink-2",
          loading && "opacity-50"
        )}
      >
        {line}
      </p>
      {liveLabel ? (
        <p className="flex min-h-[1.125rem] items-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-tint px-2 py-0.5 text-[12px] font-medium text-ink-green">
            <LiveDot />
            {liveLabel}
          </span>
        </p>
      ) : (
        <p className="min-h-[1.125rem] text-[12px] leading-snug text-ink-3">
          {sub ?? "\u00a0"}
        </p>
      )}
    </div>
  );
}

function SyncTile({
  className,
  label,
  nextStamp,
  loading,
  error,
  pending,
}: {
  className?: string;
  label: string | null;
  nextStamp: string | null;
  loading: boolean;
  error: string | null;
  pending: boolean;
}) {
  const agent = useAgentRuntimeStatus();
  const reduced = useReducedMotion();
  const [face, setFace] = useState<"panorama" | "analyst">("panorama");

  useEffect(() => {
    if (reduced) return;
    let id = 0;
    const start = () => {
      window.clearInterval(id);
      id = window.setInterval(() => {
        setFace((current) => (current === "panorama" ? "analyst" : "panorama"));
      }, STATUS_ROTATE_MS);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else window.clearInterval(id);
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced]);

  const panorama: StatusFaceModel = {
    title: "Panorama",
    pill: error ? "Uyarı" : pending ? "Bekliyor" : "Güncel",
    tone: error ? "warn" : pending ? "wait" : "ok",
    line: label ?? (loading ? "Kontrol ediliyor…" : "Henüz sync kaydı yok"),
    sub: nextStamp ? `Sonraki: ${nextStamp}` : null,
    loading,
  };

  const analyst: StatusFaceModel = agent.ok
    ? {
        title: "Analyst",
        pill: "Operasyonel",
        tone: "ok",
        line: "Sistem hazır",
        sub: null,
        liveLabel: "Claude Opus",
      }
    : {
        title: "Analyst",
        pill: "Uyarı",
        tone: "warn",
        line: clipAgentError(agent.message),
        sub: (() => {
          const stamp = formatIstanbulStamp(agent.at);
          return stamp ? `Son hata: ${stamp}` : null;
        })(),
      };

  const summary = agent.ok
    ? `${panorama.title} ${panorama.pill}. ${analyst.title} ${analyst.pill}, Claude Opus.`
    : `${panorama.title} ${panorama.pill}. ${analyst.title} ${analyst.pill}.`;

  return (
    <Tile className={cn(className, "gap-1.5")} aria-label={summary}>
      {reduced ? (
        <>
          <StatusFace {...panorama} />
          <div className="border-t border-line" />
          <StatusFace {...analyst} />
        </>
      ) : (
        <div className="grid overflow-hidden" aria-hidden>
          <AnimatePresence initial={false}>
            <motion.div
              key={face}
              className="col-start-1 row-start-1"
              initial={{
                opacity: 0,
                y: 14,
                filter: "blur(6px)",
                clipPath: "inset(22% 0 0 0)",
              }}
              animate={{
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
                clipPath: "inset(0% 0 0 0)",
              }}
              exit={{
                opacity: 0,
                y: -10,
                filter: "blur(6px)",
                clipPath: "inset(0 0 28% 0)",
                transition: { duration: 0.28, ease: STATUS_FACE_EASE },
              }}
              transition={{ duration: 0.46, ease: STATUS_FACE_EASE }}
            >
              <StatusFace {...(face === "panorama" ? panorama : analyst)} />
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </Tile>
  );
}

function PortfoySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-[14px] border border-line bg-card p-2.5", className)} aria-hidden>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-[22px] w-full rounded-sm" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}

function RiskSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-[14px] border border-line bg-card p-2.5", className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

function IlceSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-[14px] border border-line bg-card p-2.5", className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-[188px] w-full" />
    </div>
  );
}

function SevkSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-[14px] border border-line bg-card p-2.5", className)} aria-hidden>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

function BorcSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-[14px] border border-line bg-card p-2.5", className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-[188px] w-full" />
    </div>
  );
}
