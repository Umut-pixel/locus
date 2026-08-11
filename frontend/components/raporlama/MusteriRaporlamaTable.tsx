"use client";

import { Fragment, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { Typography } from "@heroui/react";

import { musteriGoogleMapsUrl } from "@/components/map/CustomerDetailPanel";
import {
  CurrencyAmount,
  DurumTag,
  RiskPill,
  SegmentTag,
  TemsilciAvatar,
} from "@/components/raporlama/cells";
import { Sparkline } from "@/components/raporlama/Sparkline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentBar } from "@/components/ui/segment-bar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BORC_GECIKME_BANTLARI,
  RAPORLAMA_PAGE_SIZE,
  useMusteriDetay,
  useMusteriTrend,
  type MusteriDetay,
  type MusteriRaporSatiri,
  type RaporlamaSort,
  type RaporlamaSortAlan,
} from "@/hooks/useMusteriRaporlama";
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDate,
  formatDateTime,
  formatKg,
  formatNumber,
} from "@/lib/format";
import {
  RISK_MODE_LABELS,
  debtRiskDurumu,
  riskLabelsForMode,
  riskShortLabelsForMode,
  type RiskMetricMode,
} from "@/lib/risk-mode";
import { HASSASIYET_LABELS, RISK_COLORS } from "@/lib/risk-style";
import { AKSIYON_GUN } from "@/lib/snapshot-compare";
import type { RiskDurumu } from "@/lib/types";
import { cn } from "@/lib/utils";

const MusteriMiniMap = dynamic(
  () =>
    import("@/components/raporlama/MusteriMiniMap").then((m) => m.MusteriMiniMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
  }
);

interface MusteriRaporlamaTableProps {
  rows: MusteriRaporSatiri[];
  loading: boolean;
  error: string | null;
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  sort: RaporlamaSort | null;
  onSortChange: (next: RaporlamaSort | null) => void;
  selectedRows: Map<string, MusteriRaporSatiri>;
  onToggleSelect: (row: MusteriRaporSatiri) => void;
  onSelectPage: (rows: MusteriRaporSatiri[], checked: boolean) => void;
  riskMode: RiskMetricMode;
  onToggleRiskMode: () => void;
}

/** Kolon başlığına tıklama döngüsü: azalan → artan → varsayılan (null). */
function nextSort(
  alan: RaporlamaSortAlan,
  current: RaporlamaSort | null
): RaporlamaSort | null {
  if (!current || current.alan !== alan) return { alan, yon: "desc" };
  if (current.yon === "desc") return { alan, yon: "asc" };
  return null;
}

/** Yoğun tablo başlığı — 2026-08-10: "çok dar" geri bildirimiyle 10px→12px büyütüldü. */
const TH_BASE =
  "h-[var(--row-h-head)] px-3 text-[12px] font-medium tracking-[0.06em] whitespace-nowrap uppercase";

function SortableHeader({
  alan,
  sort,
  onSortChange,
  children,
}: {
  alan: RaporlamaSortAlan;
  sort: RaporlamaSort | null;
  onSortChange: (next: RaporlamaSort | null) => void;
  children: React.ReactNode;
}) {
  const active = sort?.alan === alan;
  const Icon = active
    ? sort!.yon === "desc"
      ? ChevronDownIcon
      : ChevronUpIcon
    : ChevronsUpDownIcon;
  return (
    <th scope="col" className={cn(TH_BASE, "text-right")}>
      <button
        type="button"
        onClick={() => onSortChange(nextSort(alan, sort))}
        className={cn(
          "inline-flex flex-row-reverse items-center gap-1 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground",
          active && "text-foreground"
        )}
      >
        {children}
        <Icon className={cn("size-3", active ? "opacity-100" : "opacity-45")} />
      </button>
    </th>
  );
}

/**
 * Risk kolonu başlığı, sıralanabilir başlıklarla aynı tıklanabilir dilde —
 * ama sıra yerine ölçüt değiştirir: borç yaşlandırması ↔ sevkiyat gecikmesi.
 * Etiketin yanındaki küçük rozet o an hangi ölçütün aktif olduğunu gösterir.
 */
function RiskModeHeader({
  riskMode,
  onToggle,
}: {
  riskMode: RiskMetricMode;
  onToggle: () => void;
}) {
  return (
    <th scope="col" className={TH_BASE}>
      <button
        type="button"
        onClick={onToggle}
        title={`Risk ölçütü: ${RISK_MODE_LABELS[riskMode]} — değiştirmek için tıkla`}
        className="inline-flex items-center gap-1.5 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
      >
        Risk
        <span className="inline-flex items-center gap-1 rounded-[4px] bg-muted px-1.5 py-0.5 text-[9.5px] font-medium normal-case tracking-normal text-foreground/75">
          <ArrowLeftRightIcon className="size-2.5" />
          {RISK_MODE_LABELS[riskMode]}
        </span>
      </button>
    </th>
  );
}

const COLUMN_COUNT = 8;
const SKELETON_ROWS = 12;
/** 28+ gün bantları riskli_tutar tarafına yaklaşır — kırmızı; öncesi amber. */
const LATE_BAND_KEYS = new Set([
  "hf_28_34",
  "hf_35_41",
  "hf_42_48",
  "hf_49_55",
  "hf_56_62",
  "hf_63_69",
  "hf_70_ustu",
]);

export function MusteriRaporlamaTable({
  rows,
  loading,
  error,
  page,
  totalCount,
  onPageChange,
  sort,
  onSortChange,
  selectedRows,
  onToggleSelect,
  onSelectPage,
  riskMode,
  onToggleRiskMode,
}: MusteriRaporlamaTableProps) {
  const musteriKodlari = useMemo(() => rows.map((r) => r.musteri_kodu), [rows]);
  const { trendMap } = useMusteriTrend(musteriKodlari);
  const [expandedKod, setExpandedKod] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(totalCount / RAPORLAMA_PAGE_SIZE));
  const fromRow = totalCount === 0 ? 0 : page * RAPORLAMA_PAGE_SIZE + 1;
  const toRow = Math.min(totalCount, (page + 1) * RAPORLAMA_PAGE_SIZE);

  const allPageSelected =
    rows.length > 0 && rows.every((r) => selectedRows.has(r.musteri_kodu));
  const indeterminate =
    !allPageSelected && rows.some((r) => selectedRows.has(r.musteri_kodu));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[60rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className={cn(TH_BASE, "w-9 pr-0 pl-3.5")}>
                <Checkbox
                  checked={allPageSelected}
                  indeterminate={indeterminate}
                  onCheckedChange={(checked) => onSelectPage(rows, checked)}
                  aria-label="Sayfadaki tüm satırları seç"
                />
              </th>
              <th scope="col" className={cn(TH_BASE, "w-full")}>
                Müşteri
              </th>
              <th scope="col" className={TH_BASE}>
                Segment / Durum
              </th>
              <th scope="col" className={TH_BASE}>
                Temsilci
              </th>
              <RiskModeHeader riskMode={riskMode} onToggle={onToggleRiskMode} />
              <SortableHeader alan="ciro" sort={sort} onSortChange={onSortChange}>
                Net Ciro
              </SortableHeader>
              <SortableHeader
                alan="acik_bakiye"
                sort={sort}
                onSortChange={onSortChange}
              >
                Açık Bakiye
              </SortableHeader>
              <th scope="col" className={cn(TH_BASE, "pr-3.5")}>
                Trend 14g
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))
              : rows.map((row) => (
                  <Fragment key={row.musteri_kodu}>
                    <RaporSatiri
                      row={row}
                      trend={trendMap.get(row.musteri_kodu) ?? []}
                      selected={selectedRows.has(row.musteri_kodu)}
                      expanded={expandedKod === row.musteri_kodu}
                      riskMode={riskMode}
                      onToggleSelect={onToggleSelect}
                      onToggleExpand={() =>
                        setExpandedKod((prev) =>
                          prev === row.musteri_kodu ? null : row.musteri_kodu
                        )
                      }
                    />
                    {expandedKod === row.musteri_kodu ? (
                      <tr className="border-b border-border bg-muted/25">
                        <td colSpan={COLUMN_COUNT} className="p-0">
                          <MusteriDetayPanel row={row} riskMode={riskMode} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="px-3 py-16 text-center align-middle"
                >
                  <Typography.Heading level={6}>
                    {error ? "Veri yüklenemedi" : "Eşleşen müşteri yok"}
                  </Typography.Heading>
                  <Typography.Paragraph size="sm" color="muted" className="mt-1">
                    {error
                      ? error
                      : "Filtreleri gevşetin ya da arama terimini kısaltın."}
                  </Typography.Paragraph>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex h-11 shrink-0 items-center justify-between border-t border-border/60 px-3.5 text-[13.5px] text-muted-foreground">
        <span className="tabular-nums">
          {totalCount === 0
            ? "0 müşteri"
            : `${formatNumber(fromRow)}–${formatNumber(toRow)} / ${formatNumber(totalCount)} müşteri`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
            aria-label="Önceki sayfa"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="min-w-[4rem] text-center font-mono tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            disabled={page + 1 >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Sonraki sayfa"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Veri hücresi ortak ölçüsü — satır yüksekliğini tr belirler, td yalnızca yatay pay verir. */
const TD_BASE = "px-3 align-middle";

function RaporSatiri({
  row,
  trend,
  selected,
  expanded,
  riskMode,
  onToggleSelect,
  onToggleExpand,
}: {
  row: MusteriRaporSatiri;
  trend: { tarih: string; net_ciro: number }[];
  selected: boolean;
  expanded: boolean;
  riskMode: RiskMetricMode;
  onToggleSelect: (row: MusteriRaporSatiri) => void;
  onToggleExpand: () => void;
}) {
  const danger = (row.yas_riskli_tutar ?? 0) > 0;
  const risk = riskMode === "borc" ? debtRiskDurumu(row) : row.risk_durumu;
  const trendValues = trend.map((t) => t.net_ciro);
  // Sparkline rengi borç riskiyle değil gerçek ciro yönüyle eşleşsin — aksi
  // halde aynı düşen eğri hem "riskli" (kırmızı) hem "sağlıklı ama düşüyor"
  // (mavi) satırlarda aynı görünüp yanıltıcı oluyordu. Borç riski zaten Risk
  // rozetinde ve kırmızı Açık Bakiye tutarında ayrıca gösteriliyor.
  const trendDusuyor =
    trendValues.length >= 2 &&
    trendValues[trendValues.length - 1]! < trendValues[0]!;
  return (
    <tr
      className={cn(
        "h-[var(--row-h)] cursor-pointer border-b border-border/50 transition-colors duration-100",
        selected
          ? "bg-accent/70 hover:bg-accent"
          : expanded
            ? "bg-muted/40"
            : "hover:bg-muted/45"
      )}
      onClick={onToggleExpand}
      aria-expanded={expanded}
    >
      <td className={cn(TD_BASE, "w-9 pr-0 pl-3.5")} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(row)}
          aria-label={`${row.unvan} satırını seç`}
        />
      </td>
      <td className={cn(TD_BASE, "max-w-0")}>
        <p className="truncate text-[14px] leading-[18px] font-medium text-foreground">
          {row.unvan}
        </p>
        <p className="truncate font-mono text-[12.5px] leading-[16px] text-muted-foreground">
          {row.musteri_kodu} ·{" "}
          {[row.ilce, row.sehir].filter(Boolean).join(", ") || "—"}
        </p>
      </td>
      <td className={TD_BASE}>
        <div className="flex items-center gap-1.5">
          <SegmentTag musteriGrubu={row.musteri_grubu} />
          <DurumTag durum={row.durum} />
        </div>
      </td>
      <td className={TD_BASE}>
        <TemsilciAvatar ad={row.belge_st_adi} />
      </td>
      <td className={TD_BASE}>
        <RiskPill risk={risk} labels={riskShortLabelsForMode(riskMode)} />
      </td>
      <td className={cn(TD_BASE, "text-right")}>
        <CurrencyAmount value={row.belge_net_ciro} />
      </td>
      <td className={cn(TD_BASE, "text-right")}>
        <CurrencyAmount value={row.yas_toplam} precise danger={danger} />
      </td>
      <td className={cn(TD_BASE, "pr-3.5")}>
        <Sparkline
          values={trendValues}
          color={trendDusuyor ? "#f87171" : "#60a5fa"}
        />
      </td>
    </tr>
  );
}

const DETAY_TABS = [
  { id: "ozet", label: "Özet" },
  { id: "yaslandirma", label: "ST Yaşlandırma" },
  { id: "sevkiyat", label: "Sevkiyat" },
] as const;
type DetayTab = (typeof DETAY_TABS)[number]["id"];

/**
 * Satır açılınca müşteriye özel ek alanlar — aynı view'dan tek satırlık
 * genişletilmiş bir projeksiyonla çekilir. Tasarım dili haritadaki
 * CustomerDetailPanel'den bilinçli olarak birebir alınır: mono uppercase
 * bölüm etiketleri, dt/dd metrik satırları, risk göstergesi için SegmentBar,
 * riskli tutar için renk-tonlu callout — burada tek fark, dar/yüzen kart
 * yerine tablo satırı genişliğinde yatay bir düzen (kaydırmalı sekme yerine
 * gerçek sekme şeridi kullanılabilecek kadar yer var).
 */
function MusteriDetayPanel({
  row,
  riskMode,
}: {
  row: MusteriRaporSatiri;
  riskMode: RiskMetricMode;
}) {
  const { detay, loading } = useMusteriDetay(row.musteri_kodu);
  const [tab, setTab] = useState<DetayTab>("ozet");

  if (loading) {
    return (
      <div className="flex items-center gap-4 px-4 py-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  if (!detay) return null;

  const risk = riskMode === "borc" ? debtRiskDurumu(row) : row.risk_durumu;
  const accent = RISK_COLORS[risk];

  // Gösterge yüzdesi mod'a göre iki farklı hesap: borçta riskli tutarın açık
  // bakiyeye oranı, sevkiyatta gecikme gününün eşiğe (AKSIYON_GUN) oranı.
  let gaugePercent: number | null;
  let gaugeLabel: string;
  if (riskMode === "borc") {
    const toplamBorc = detay.yas_toplam ?? row.yas_toplam;
    const riskliTutar = detay.yas_riskli_tutar ?? row.yas_riskli_tutar ?? 0;
    gaugePercent =
      toplamBorc != null && toplamBorc > 0.005
        ? Math.min(Math.round((riskliTutar / toplamBorc) * 100), 100)
        : null;
    gaugeLabel =
      gaugePercent != null
        ? `Açık bakiyenin riskli (56+ gün) payı %${gaugePercent}'i`
        : toplamBorc == null
          ? "Yaşlandırma kaydı yok"
          : "Açık bakiye yok";
  } else {
    const hicTeslimat = row.risk_durumu === "hic_teslimat_yok";
    const gecikmeGun = detay.son_teslimattan_gecen_gun;
    gaugePercent =
      !hicTeslimat && gecikmeGun != null
        ? Math.min(Math.round((gecikmeGun / AKSIYON_GUN) * 100), 999)
        : null;
    gaugeLabel =
      gaugePercent != null
        ? `Gecikme eşiğinin %${gaugePercent}'i`
        : "Teslimat kaydı yok";
  }

  const hasCoords = detay.lat != null && detay.lon != null;

  return (
    <div className="flex items-start gap-8 px-4 py-4">
      <div className="min-w-0 flex-1">
        {detay.adres ? (
          <Typography type="body-sm" truncate className="mb-3.5">
            {detay.adres}
          </Typography>
        ) : null}

        <div className="flex items-baseline justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            <span
              className="font-mono text-[11px] tracking-wide uppercase"
              style={{ color: accent }}
            >
              {riskLabelsForMode(riskMode)[risk]}
            </span>
          </span>
          {gaugePercent != null ? (
            <span
              className="font-mono text-[15px] font-semibold tabular-nums"
              style={{ color: accent }}
            >
              %{gaugePercent}
            </span>
          ) : null}
        </div>
        <SegmentBar
          className="mt-2"
          segments={40}
          value={gaugePercent != null ? gaugePercent / 100 : 0}
          color={accent}
          label={gaugeLabel}
        />

        <div
          role="tablist"
          className="mt-4 flex items-center gap-4 border-b border-border/60"
        >
          {DETAY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-0.5 pb-2 font-mono text-[11px] tracking-[0.06em] uppercase transition-colors",
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-3.5">
          {tab === "ozet" ? (
            <OzetTabIcerik row={row} detay={detay} />
          ) : tab === "yaslandirma" ? (
            <YaslandirmaTabIcerik detay={detay} />
          ) : (
            <SevkiyatTabIcerik row={row} detay={detay} />
          )}
        </div>
      </div>

      <KonumKarti detay={detay} risk={risk} hasCoords={hasCoords} unvan={row.unvan} />
    </div>
  );
}

/** Haritadaki MetricRow ile birebir aynı dt/dd sözlüğü — dense panelde 2 sütun. */
function MetricRow({
  label,
  value,
  strong = false,
  danger = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "truncate text-right font-mono text-[13px] tabular-nums",
          strong && "font-semibold",
          danger ? "text-red-400" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">{children}</dl>
  );
}

function OzetTabIcerik({
  row,
  detay,
}: {
  row: MusteriRaporSatiri;
  detay: MusteriDetay;
}) {
  return (
    <MetricGrid>
      <MetricRow
        label="Net ciro"
        value={
          detay.belge_net_ciro != null
            ? formatCurrency(detay.belge_net_ciro)
            : "—"
        }
        strong
      />
      <MetricRow
        label="Açık bakiye"
        value={detay.yas_toplam != null ? formatCurrency(detay.yas_toplam) : "—"}
        strong
        danger={(detay.yas_riskli_tutar ?? 0) > 0}
      />
      <MetricRow
        label="Son işlem"
        value={formatDate(detay.belge_son_islem_tarihi)}
      />
      <MetricRow
        label="Vade"
        value={
          detay.belge_vade_gunu != null
            ? `${formatNumber(detay.belge_vade_gunu)} gün`
            : "—"
        }
      />
      <MetricRow
        label="Sipariş / Fatura"
        value={`${formatNumber(row.belge_siparis_sayisi ?? 0)} / ${formatNumber(row.belge_fatura_sayisi ?? 0)}`}
      />
      <MetricRow label="Segment" value={row.musteri_grubu ?? "—"} />
      {detay.belge_top_urun ? (
        <MetricRow label="En çok satılan" value={detay.belge_top_urun} />
      ) : null}
      {detay.belge_son_urun ? (
        <MetricRow label="Son satılan" value={detay.belge_son_urun} />
      ) : null}
    </MetricGrid>
  );
}

function SevkiyatTabIcerik({
  row,
  detay,
}: {
  row: MusteriRaporSatiri;
  detay: MusteriDetay;
}) {
  return (
    <MetricGrid>
      <MetricRow
        label="Son teslimat"
        value={formatDate(row.son_teslimat_tarihi)}
        strong
      />
      <MetricRow
        label="İlk teslimat"
        value={formatDate(detay.ilk_teslimat_tarihi)}
      />
      <MetricRow
        label="Geçen gün"
        value={
          detay.son_teslimattan_gecen_gun != null
            ? `${formatNumber(detay.son_teslimattan_gecen_gun)} gün`
            : "—"
        }
      />
      <MetricRow
        label="Teslimat sayısı"
        value={formatNumber(row.toplam_teslimat_sayisi)}
      />
      <MetricRow
        label="Toplam ciro"
        value={detay.toplam_tutar != null ? formatCurrency(detay.toplam_tutar) : "—"}
      />
      <MetricRow
        label="Toplam ağırlık"
        value={detay.toplam_agirlik != null ? formatKg(detay.toplam_agirlik) : "—"}
      />
      <MetricRow label="Müşteri durumu" value={row.durum ?? "—"} />
      <MetricRow label="Rut" value={detay.rut_kod ?? "—"} />
      <MetricRow
        label="Son veri güncelleme"
        value={formatDateTime(detay.guncellendi)}
      />
    </MetricGrid>
  );
}

function YaslandirmaTabIcerik({ detay }: { detay: MusteriDetay }) {
  if (detay.yas_toplam == null) {
    return (
      <Typography.Paragraph size="sm" color="muted">
        Henüz yaşlandırma verisi yok.
      </Typography.Paragraph>
    );
  }

  const toplam = detay.yas_toplam;
  const riskliTutar = detay.yas_riskli_tutar ?? 0;
  const riskli = Boolean(detay.borc_riskli) || riskliTutar > 0.005;
  const risksizTutar = Math.max(0, Math.round((toplam - riskliTutar) * 100) / 100);
  const bantlar = BORC_GECIKME_BANTLARI.map((b) => ({
    label: b.label,
    late: LATE_BAND_KEYS.has(b.value),
    tutar: (detay[b.value as keyof MusteriDetay] as number | null) ?? 0,
  })).filter((b) => b.tutar > 0.005);

  return (
    <div className="flex flex-col gap-3.5">
      {riskli ? (
        <div
          className="w-fit rounded-lg px-3 py-2"
          style={{
            background: `color-mix(in oklab, ${RISK_COLORS.riskli} 14%, transparent)`,
          }}
        >
          <p
            className="font-mono text-[10.5px] tracking-[0.1em] uppercase"
            style={{ color: RISK_COLORS.riskli }}
          >
            Riskli — 56+ gün
          </p>
          <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">
            {formatCurrencyPrecise(riskliTutar)}
          </p>
        </div>
      ) : null}

      <MetricGrid>
        <MetricRow
          label="Gecikmeli borç"
          value={formatCurrencyPrecise(toplam)}
          strong
        />
        <MetricRow label="Risk durumu" value={riskli ? "Riskli" : "Normal"} />
        <MetricRow
          label="Riskli borç (56+ gün)"
          value={riskliTutar > 0.005 ? formatCurrencyPrecise(riskliTutar) : "—"}
          danger={riskliTutar > 0.005}
        />
        <MetricRow
          label="Risksiz borç (56 gün altı)"
          value={risksizTutar > 0.005 ? formatCurrencyPrecise(risksizTutar) : "—"}
        />
        <MetricRow label="ST" value={detay.yas_st?.trim() || "—"} />
        <MetricRow
          label="Son güncelleme"
          value={formatDateTime(detay.yas_inserted_at)}
        />
      </MetricGrid>

      {bantlar.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <p className="mb-1.5 font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
            Gün bandı kırılımı
          </p>
          <MetricGrid>
            {bantlar.map((b) => (
              <MetricRow
                key={b.label}
                label={`${b.label} gün${b.late ? " · risk" : ""}`}
                value={formatCurrencyPrecise(b.tutar)}
                danger={b.late}
              />
            ))}
          </MetricGrid>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sağ sütun — müşterinin haritadaki tam karşılığı: yalnızca bu noktayı
 * gösteren mini Mapbox + hassasiyet rozeti + Google Maps'te aç kısayolu.
 * Sabit, tab'lardan bağımsız (özet/yaşlandırma/sevkiyat sekmesi değişse de
 * konum sütunu yerinde kalır).
 */
function KonumKarti({
  detay,
  risk,
  hasCoords,
  unvan,
}: {
  detay: MusteriDetay;
  risk: RiskDurumu;
  hasCoords: boolean;
  unvan: string;
}) {
  return (
    <div className="w-[15.5rem] shrink-0">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
          Konum
        </p>
        {detay.geocode_hassasiyet ? (
          <p className="truncate text-[10.5px] text-muted-foreground">
            {HASSASIYET_LABELS[detay.geocode_hassasiyet]}
          </p>
        ) : null}
      </div>

      {hasCoords ? (
        <div className="aspect-square w-full overflow-hidden rounded-lg border border-border">
          <MusteriMiniMap lat={detay.lat!} lon={detay.lon!} risk={risk} />
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-[12px] text-muted-foreground">
          Konum bilgisi yok
        </div>
      )}

      <a
        href={musteriGoogleMapsUrl({
          lat: detay.lat ?? 0,
          lon: detay.lon ?? 0,
          unvan,
          adres: detay.adres,
        })}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-[12px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        Google Maps’te aç
        <ExternalLinkIcon className="size-3 opacity-70" />
      </a>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="h-[var(--row-h)] border-b border-border/50">
      <td className={cn(TD_BASE, "w-9 pr-0 pl-3.5")}>
        <Skeleton className="size-4 rounded-[4px]" />
      </td>
      <td className={TD_BASE}>
        <Skeleton className="h-3 w-48" />
      </td>
      <td className={TD_BASE}>
        <Skeleton className="h-6 w-28 rounded-[6px]" />
      </td>
      <td className={TD_BASE}>
        <Skeleton className="h-6 w-28 rounded-[6px]" />
      </td>
      <td className={TD_BASE}>
        <Skeleton className="h-6 w-20 rounded-[6px]" />
      </td>
      <td className={TD_BASE}>
        <Skeleton className="ml-auto h-3 w-20" />
      </td>
      <td className={TD_BASE}>
        <Skeleton className="ml-auto h-3 w-20" />
      </td>
      <td className={cn(TD_BASE, "pr-3.5")}>
        <Skeleton className="h-5 w-16" />
      </td>
    </tr>
  );
}
