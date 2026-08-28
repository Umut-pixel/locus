"use client";

import { useState } from "react";
import { Typography } from "@heroui/react";

import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { OdenmediTable } from "@/components/tahsilat/OdenmediTable";
import { TahsilatDurumCubugu } from "@/components/tahsilat/TahsilatDurumCubugu";
import { TahsilatFilters } from "@/components/tahsilat/TahsilatFilters";
import { TahsilatKirilim } from "@/components/tahsilat/TahsilatKirilim";
import { TahsilatOzet } from "@/components/tahsilat/TahsilatOzet";
import { TahsilatTable } from "@/components/tahsilat/TahsilatTable";
import { TahsilatTrendi } from "@/components/tahsilat/TahsilatTrendi";
import {
  EMPTY_TAHSILAT_FILTERS,
  VARSAYILAN_TAHSILAT_SORT,
  useTahsilatRaporu,
  type TahsilatFilters as TahsilatFiltersTipi,
  type TahsilatSort,
} from "@/hooks/useTahsilatRaporu";
import { formatNumber } from "@/lib/format";

/**
 * Tahsilat Raporu (5230) — nakit girişi defteri.
 *
 * Satır grain'i makbuz/çek/senet belgesidir; fatura cirosu (5450) ve açık
 * bakiye (5530) ile karışmasın diye Finansal'ın içinde değil, kendi sayfası.
 */
export default function TahsilatRaporlariPage() {
  const [filters, setFilters] = useState<TahsilatFiltersTipi>(
    EMPTY_TAHSILAT_FILTERS
  );
  const [sort, setSort] = useState<TahsilatSort>(VARSAYILAN_TAHSILAT_SORT);

  const {
    satirlar,
    tumSatirlar,
    odenmediSatirlar,
    ozet,
    gunluk,
    turDagilimi,
    temsilciDagilimi,
    turSecenekleri,
    temsilciSecenekleri,
    durumSecenekleri,
    loading,
    error,
  } = useTahsilatRaporu(filters, sort);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Tahsilat
          </Typography.Heading>
          <span
            className="inline-flex h-6 shrink-0 cursor-help items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 font-mono text-[12.5px] font-medium text-emerald-400 tabular-nums"
            title="Tahsilat Raporu (5230) son çekimindeki belge sayısı. Nakit girişi; fatura cirosu değil."
          >
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            {formatNumber(tumSatirlar.length)}
          </span>
          <Typography.Paragraph
            size="sm"
            color="muted"
            truncate
            className="hidden md:block"
          >
            Nakit girişi, çek/senet ve ödenmedi izleme
          </Typography.Paragraph>
        </div>
      </div>

      <TahsilatFilters
        filters={filters}
        onChange={setFilters}
        turSecenekleri={turSecenekleri}
        temsilciSecenekleri={temsilciSecenekleri}
        durumSecenekleri={durumSecenekleri}
      />

      {error ? (
        <Typography
          type="body-sm"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3.5 py-2 text-destructive"
        >
          {error}
        </Typography>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TahsilatOzet ozet={ozet} loading={loading} />
        <TahsilatTrendi gunler={gunluk} loading={loading} />
        <TahsilatKirilim
          turDagilimi={turDagilimi}
          temsilciDagilimi={temsilciDagilimi}
          loading={loading}
        />
        <OdenmediTable satirlar={odenmediSatirlar} loading={loading} />
        <TahsilatTable
          satirlar={satirlar}
          loading={loading}
          error={error}
          sort={sort}
          onSortChange={setSort}
        />
      </div>

      <TahsilatDurumCubugu
        ozet={ozet}
        toplamBelge={tumSatirlar.length}
        loading={loading}
      />
    </div>
  );
}
