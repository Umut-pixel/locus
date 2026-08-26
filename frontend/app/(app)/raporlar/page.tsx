"use client";

import { useCallback, useState } from "react";
import { Typography } from "@heroui/react";

import { MusteriRaporlamaFilters } from "@/components/raporlama/MusteriRaporlamaFilters";
import { MusteriRaporlamaSummary } from "@/components/raporlama/MusteriRaporlamaSummary";
import { MusteriRaporlamaTable } from "@/components/raporlama/MusteriRaporlamaTable";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import {
  EMPTY_RAPORLAMA_FILTERS,
  useMusteriRaporlama,
  type MusteriRaporSatiri,
  type RaporlamaFilters,
  type RaporlamaSort,
} from "@/hooks/useMusteriRaporlama";
import { exportMusteriRaporu, exportSelectedRows } from "@/lib/raporlama-export";
import { formatNumber } from "@/lib/format";
import type { RiskMetricMode } from "@/lib/risk-mode";

/**
 * Raporlar yalnızca borç yaşlandırmasına göre risklendiriyor — sevkiyat
 * gecikmesi (harita sayfasındaki diğer ölçüt) burada kullanılmıyor, mod
 * değiştirme kaldırıldı. bkz. lib/risk-mode.ts.
 */
const RISK_MODE: RiskMetricMode = "borc";

export default function RaporlarPage() {
  const [filters, setFilters] = useState<RaporlamaFilters>(EMPTY_RAPORLAMA_FILTERS);
  const [sort, setSort] = useState<RaporlamaSort | null>(null);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Map<string, MusteriRaporSatiri>>(new Map());

  const { rows, totalCount, loading, error, summary, summaryLoading } =
    useMusteriRaporlama(filters, page, sort, RISK_MODE);

  const handleFiltersChange = useCallback((next: RaporlamaFilters) => {
    setFilters(next);
    setPage(0);
    setSelectedRows(new Map());
  }, []);

  const handleSortChange = useCallback((next: RaporlamaSort | null) => {
    setSort(next);
    setPage(0);
  }, []);

  const handleToggleSelect = useCallback((row: MusteriRaporSatiri) => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      if (next.has(row.musteri_kodu)) {
        next.delete(row.musteri_kodu);
      } else {
        next.set(row.musteri_kodu, row);
      }
      return next;
    });
  }, []);

  const handleSelectPage = useCallback(
    (pageRows: MusteriRaporSatiri[], checked: boolean) => {
      setSelectedRows((prev) => {
        const next = new Map(prev);
        if (checked) {
          for (const row of pageRows) next.set(row.musteri_kodu, row);
        } else {
          for (const row of pageRows) next.delete(row.musteri_kodu);
        }
        return next;
      });
    },
    []
  );

  const handleExport = useCallback(async () => {
    setExportError(null);
    if (selectedRows.size > 0) {
      try {
        exportSelectedRows(Array.from(selectedRows.values()), RISK_MODE, filters);
      } catch (err) {
        setExportError(
          err instanceof Error ? err.message : "Dışa aktarma başarısız oldu."
        );
      }
      return;
    }
    setExporting(true);
    try {
      await exportMusteriRaporu(filters, RISK_MODE);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Dışa aktarma başarısız oldu."
      );
    } finally {
      setExporting(false);
    }
  }, [filters, selectedRows]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Müşteri Raporlama
          </Typography.Heading>
          <span
            className="inline-flex h-6 shrink-0 cursor-help items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 font-mono text-[12.5px] font-medium text-emerald-400 tabular-nums"
            title="Panorama bayi bölgesinin (DistGrup) tüm senkron müşterileri."
          >
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            {formatNumber(totalCount)}
          </span>
          <Typography.Paragraph
            size="sm"
            color="muted"
            truncate
            className="hidden md:block"
          >
            Segment, risk ve ciro kırılımıyla müşteri portföyü
          </Typography.Paragraph>
        </div>
      </div>

      <MusteriRaporlamaFilters
        filters={filters}
        onChange={handleFiltersChange}
        sort={sort}
        onSortChange={handleSortChange}
        onExport={handleExport}
        exporting={exporting}
        selectedCount={selectedRows.size}
        riskMode={RISK_MODE}
      />

      {exportError ? (
        <Typography
          type="body-sm"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3.5 py-2 text-destructive"
        >
          {exportError}
        </Typography>
      ) : null}

      <MusteriRaporlamaTable
        rows={rows}
        loading={loading}
        error={error}
        page={page}
        totalCount={totalCount}
        onPageChange={setPage}
        sort={sort}
        onSortChange={handleSortChange}
        selectedRows={selectedRows}
        onToggleSelect={handleToggleSelect}
        onSelectPage={handleSelectPage}
        riskMode={RISK_MODE}
        filters={filters}
      />

      <MusteriRaporlamaSummary
        totalCount={totalCount}
        summary={summary}
        loading={summaryLoading}
        riskMode={RISK_MODE}
        filters={filters}
      />
    </div>
  );
}
