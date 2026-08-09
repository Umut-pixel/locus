"use client";

import { useCallback, useState } from "react";

import { MusteriRaporlamaFilters } from "@/components/raporlama/MusteriRaporlamaFilters";
import { MusteriRaporlamaSummary } from "@/components/raporlama/MusteriRaporlamaSummary";
import { MusteriRaporlamaTable } from "@/components/raporlama/MusteriRaporlamaTable";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import {
  EMPTY_RAPORLAMA_FILTERS,
  useMusteriRaporlama,
  type RaporlamaFilters,
} from "@/hooks/useMusteriRaporlama";
import { exportMusteriRaporu } from "@/lib/raporlama-export";

export default function RaporlarPage() {
  const [filters, setFilters] = useState<RaporlamaFilters>(EMPTY_RAPORLAMA_FILTERS);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { rows, totalCount, loading, error, summary, summaryLoading } =
    useMusteriRaporlama(filters, page);

  const handleFiltersChange = useCallback((next: RaporlamaFilters) => {
    setFilters(next);
    setPage(0);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportMusteriRaporu(filters);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Dışa aktarma başarısız oldu."
      );
    } finally {
      setExporting(false);
    }
  }, [filters]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <AppSidebarMobileTrigger />
        <div className="min-w-0">
          <h1 className="text-[15px] font-medium tracking-tight">Müşteri Raporlama</h1>
          <p className="text-xs text-muted-foreground">
            Segment, risk ve ciro kırılımıyla müşteri portföyü
          </p>
        </div>
      </div>

      <MusteriRaporlamaFilters
        filters={filters}
        onChange={handleFiltersChange}
        onExport={handleExport}
        exporting={exporting}
      />

      {exportError ? (
        <p className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive sm:px-6">
          {exportError}
        </p>
      ) : null}

      <MusteriRaporlamaTable
        rows={rows}
        loading={loading}
        error={error}
        page={page}
        totalCount={totalCount}
        onPageChange={setPage}
      />

      <MusteriRaporlamaSummary
        totalCount={totalCount}
        summary={summary}
        loading={summaryLoading}
      />
    </div>
  );
}
