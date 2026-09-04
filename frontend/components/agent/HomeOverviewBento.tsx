"use client";

import { useEffect, useState, type ReactNode } from "react";

import { IlceBarChart } from "@/components/agent/IlceBarChart";
import { BorcRiskAreaChart } from "@/components/agent/BorcRiskAreaChart";
import { LinearGauge } from "@/components/agent/LinearGauge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RaporCekmePaneli } from "@/components/panorama/RaporCekmePaneli";
import { useRaporCekme } from "@/hooks/useRaporCekme";
import {
  useHomeOverview,
  type HomeDurumSlice,
  type HomeIlceSlice,
  type HomeOverview,
  type HomeRiskSlice,
  type HomeSevkSatiri,
  type HomeBorcBant,
} from "@/hooks/useHomeOverview";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  MANUAL_SYNC_COOLDOWN_MS,
  MANUAL_SYNC_STORAGE_KEY,
} from "@/lib/panorama-manual-sync";
import { RISK_COLORS } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

const DURUM_RENK: Record<HomeDurumSlice["ad"], string> = {
  Aktif: "var(--locus-blue)",
  Pasif: "var(--muted-foreground)",
  İptal: "var(--destructive)",
  Diğer: "var(--locus-blue-mid)",
};

const BORC_ORAN_RENK: Record<string, string> = {
  saglikli: "var(--locus-blue-soft)",
  izlenmeli: "var(--locus-blue-mid)",
  riskli: "var(--locus-blue)",
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
                active?.ad === s.ad
                  ? s.ad === "Aktif"
                    ? "bg-[var(--locus-blue-soft)] text-[var(--locus-blue)] dark:bg-[var(--locus-blue)] dark:text-[#f5f5f5]"
                    : "bg-field text-ink"
                  : "text-ink-2 hover:bg-hover hover:text-ink"
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
                  style={{ backgroundColor: BORC_ORAN_RENK[s.key] ?? RISK_COLORS[s.key] }}
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
  action?: ReactNode;
};

function readManualSyncAt(): number {
  try {
    const raw = window.localStorage.getItem(MANUAL_SYNC_STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function cooldownLeftMs(at: number, now: number): number {
  if (!at) return 0;
  return Math.max(0, at + MANUAL_SYNC_COOLDOWN_MS - now);
}

function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  const pill =
    tone === "warn"
      ? "bg-red-tint text-ink-red"
      : tone === "wait"
        ? "bg-muted text-caution"
        : "bg-[var(--locus-blue-soft)] text-[var(--locus-blue)] dark:bg-[var(--locus-blue)] dark:text-[#f5f5f5]";
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
  action,
}: StatusFaceModel) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col justify-center gap-1.5 text-left">
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
        <div className="flex min-h-[1.125rem] items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[12px] leading-snug text-ink-3">
            {sub ?? "\u00a0"}
          </p>
          {action}
        </div>
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
  const { run, calisiyor } = useRaporCekme();
  const [now, setNow] = useState(() => Date.now());
  const [manualAt, setManualAt] = useState(0);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    setManualAt(readManualSyncAt());
  }, []);

  // Çekim başka bir sayfadan ya da sohbetten başlatılmış olabilir; o zaman
  // damga provider'dan gelir. İkisinin en yenisi geçerli sayılır — böylece
  // effect ile state kopyalamaya gerek kalmıyor.
  const etkinManualAt = Math.max(manualAt, run?.basladiAt ?? 0);
  const remainingMs = cooldownLeftMs(etkinManualAt, now);

  useEffect(() => {
    if (remainingMs <= 0) return;
    // Saniye gösterirken 30 sn'lik tik sayacı dondurmuş gibi gösteriyordu:
    // son dakikada saniyede bir, öncesinde 30 sn'de bir yenile.
    const tik = remainingMs < 60_000 ? 1_000 : 30_000;
    const id = window.setTimeout(() => setNow(Date.now()), Math.min(remainingMs, tik));
    return () => window.clearTimeout(id);
  }, [remainingMs]);

  // Cooldown artık 1 dk; dakikaya yuvarlamak hep "1 dk" gösteriyordu.
  // Bir dakikanın altında saniye, üstünde dakika.
  const cooldownLabel =
    remainingMs > 0
      ? remainingMs < 60_000
        ? `${Math.max(1, Math.ceil(remainingMs / 1000))} sn`
        : `${Math.ceil(remainingMs / 60_000)} dk`
      : null;

  /*
   * Düğme artık doğrudan tetiklemiyor: hangi raporların çekileceğini
   * seçtiren panel açılıyor (sohbetteki kartın aynısı). Cooldown yalnız
   * seçilen raporlara bakıyor, o yüzden burada sayaç dolmadan da paneli
   * açabiliyoruz — sunucu gerekirse 429 döner ve panel bunu gösterir.
   *
   * Sync bozulduğu an manuel tetik en çok gereken şey; süpürücü hata
   * kolonunu doldurunca kutucuk "Uyarı"ya düşüyor, bu yüzden düğme
   * "Güncel" durumunun arkasına saklanmıyor.
   */
  const manualAction = !loading ? (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="shrink-0 border-line text-[11px] text-ink-2"
      title="Panorama raporlarını seçip şimdi çek"
      onClick={(e) => {
        e.stopPropagation();
        setAcik(true);
      }}
    >
      {calisiyor ? "Çekiliyor…" : remainingMs > 0 ? `Çek (${cooldownLabel})` : "Şimdi çek"}
    </Button>
  ) : null;

  const panorama: StatusFaceModel = {
    title: "Panorama",
    pill: error ? "Uyarı" : pending ? "Bekliyor" : "Güncel",
    tone: error ? "warn" : pending ? "wait" : "ok",
    line: label ?? (loading ? "Kontrol ediliyor…" : "Henüz sync kaydı yok"),
    sub: nextStamp ? `Sonraki: ${nextStamp}` : null,
    loading,
    action: manualAction,
  };

  const summary = `${panorama.title} ${panorama.pill}`;

  return (
    <>
      <Tile className={cn(className, "min-h-0")} aria-label={summary}>
        <StatusFace {...panorama} />
      </Tile>

      <Sheet open={acik} onOpenChange={setAcik}>
        <SheetContent side="right" className="w-[min(26rem,100vw)] gap-0 p-0">
          <SheetHeader className="border-b border-line px-4 py-3">
            <SheetTitle className="text-[14px]">Panorama&apos;dan çek</SheetTitle>
            <SheetDescription className="text-[12px]">
              {remainingMs > 0
                ? `Son çekimden bu yana ${cooldownLabel} geçmedi; aynı raporu tekrar çekmek reddedilebilir.`
                : "Yalnız ihtiyacınız olan raporu seçin — çekim çok daha kısa sürer."}
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-4">
            <RaporCekmePaneli
              baslik="Çekilecek raporlar"
              onBitti={() => {
                const at = Date.now();
                setManualAt(at);
                setNow(at);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
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
