"use client";

import { useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import {
  CurrencyAmount,
  DurumTag,
  RiskPill,
  SegmentTag,
  TemsilciAvatar,
} from "@/components/raporlama/cells";
import { Sparkline } from "@/components/raporlama/Sparkline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RAPORLAMA_PAGE_SIZE,
  useMusteriTrend,
  type MusteriRaporSatiri,
} from "@/hooks/useMusteriRaporlama";
import { formatNumber } from "@/lib/format";

interface MusteriRaporlamaTableProps {
  rows: MusteriRaporSatiri[];
  loading: boolean;
  error: string | null;
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

const COLUMN_COUNT = 7;
const SKELETON_ROWS = 8;

export function MusteriRaporlamaTable({
  rows,
  loading,
  error,
  page,
  totalCount,
  onPageChange,
}: MusteriRaporlamaTableProps) {
  const musteriKodlari = useMemo(() => rows.map((r) => r.musteri_kodu), [rows]);
  const { trendMap } = useMusteriTrend(musteriKodlari);

  const pageCount = Math.max(1, Math.ceil(totalCount / RAPORLAMA_PAGE_SIZE));
  const fromRow = totalCount === 0 ? 0 : page * RAPORLAMA_PAGE_SIZE + 1;
  const toRow = Math.min(totalCount, (page + 1) * RAPORLAMA_PAGE_SIZE);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[62rem] border-collapse text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/70 text-[11px] tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                Müşteri
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Segment / Durum
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Temsilci
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Risk
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Net Ciro
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Açık Bakiye
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Ciro trendi (14g)
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))
              : rows.map((row) => (
                  <RaporSatiri
                    key={row.musteri_kodu}
                    row={row}
                    trend={trendMap.get(row.musteri_kodu) ?? []}
                  />
                ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="px-6 py-12 text-center text-sm text-muted-foreground"
                >
                  {error
                    ? `Veri yüklenemedi: ${error}`
                    : "Bu filtrelerle eşleşen müşteri yok."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground sm:px-6">
        <span>
          {totalCount === 0
            ? "0 müşteri"
            : `${formatNumber(fromRow)}–${formatNumber(toRow)} / ${formatNumber(totalCount)} müşteri`}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
            aria-label="Önceki sayfa"
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-[4.5rem] text-center font-mono tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page + 1 >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Sonraki sayfa"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

function RaporSatiri({
  row,
  trend,
}: {
  row: MusteriRaporSatiri;
  trend: { tarih: string; net_ciro: number }[];
}) {
  const danger = (row.yas_riskli_tutar ?? 0) > 0;
  return (
    <tr className="border-b border-border/40 hover:bg-muted/40">
      <td className="px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.unvan}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {row.musteri_kodu} · {[row.ilce, row.sehir].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1">
          <SegmentTag musteriGrubu={row.musteri_grubu} />
          <DurumTag durum={row.durum} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <TemsilciAvatar ad={row.belge_st_adi} />
      </td>
      <td className="px-3 py-2.5">
        <RiskPill risk={row.risk_durumu} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <CurrencyAmount value={row.belge_net_ciro} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <CurrencyAmount value={row.yas_toplam} precise danger={danger} />
      </td>
      <td className="px-3 py-2.5">
        <Sparkline
          values={trend.map((t) => t.net_ciro)}
          color={danger ? "#f87171" : "#60a5fa"}
        />
      </td>
    </tr>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/40">
      <td className="px-4 py-3 sm:px-6">
        <Skeleton className="h-3.5 w-40" />
      </td>
      <td className="px-3 py-3">
        <Skeleton className="h-5 w-20 rounded-full" />
      </td>
      <td className="px-3 py-3">
        <Skeleton className="h-5 w-24 rounded-full" />
      </td>
      <td className="px-3 py-3">
        <Skeleton className="h-5 w-16 rounded-full" />
      </td>
      <td className="px-3 py-3">
        <Skeleton className="ml-auto h-3.5 w-16" />
      </td>
      <td className="px-3 py-3">
        <Skeleton className="ml-auto h-3.5 w-16" />
      </td>
      <td className="px-3 py-3">
        <Skeleton className="h-6 w-16" />
      </td>
    </tr>
  );
}
