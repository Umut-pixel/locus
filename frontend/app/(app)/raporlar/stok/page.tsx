"use client";

import { useCallback, useState } from "react";
import { Typography } from "@heroui/react";

import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { StokDagilim } from "@/components/stok/StokDagilim";
import { StokDurumCubugu } from "@/components/stok/StokDurumCubugu";
import { StokFilters } from "@/components/stok/StokFilters";
import { StokOzet } from "@/components/stok/StokOzet";
import { StokTable } from "@/components/stok/StokTable";
import { StoktaYokPanel } from "@/components/stok/StoktaYokPanel";
import {
  EMPTY_STOK_FILTERS,
  VARSAYILAN_STOK_SORT,
  useStokRaporu,
  type StokBoyut,
  type StokFilters as StokFiltersTipi,
  type StokSort,
} from "@/hooks/useStokRaporu";
import { formatNumber } from "@/lib/format";

/**
 * Detaylı Stok Raporu (5430) — depo envanterinin anlık görüntüsü.
 *
 * Bu veri müşteri/harita modeline bağlanmıyor (konum ya da müşteri alanı
 * yok), o yüzden raporların altında kendi sayfası. Stok × sipariş çaprazı
 * bilinçli olarak kapsam dışı: 5450 yalnızca Fatura'ya daraltılmış durumda,
 * sipariş tipi belge kaynağı yok.
 */
export default function StokRaporlariPage() {
  const [filters, setFilters] = useState<StokFiltersTipi>(EMPTY_STOK_FILTERS);
  const [sort, setSort] = useState<StokSort>(VARSAYILAN_STOK_SORT);
  const [boyut, setBoyut] = useState<StokBoyut>("marka");

  const {
    satirlar,
    tumSatirlar,
    ozet,
    stoktaYokSatirlar,
    markaSecenekleri,
    kategoriSecenekleri,
    loading,
    error,
  } = useStokRaporu(filters, sort);

  const handleStoktaYokToggle = useCallback(() => {
    setFilters((f) => ({ ...f, sadeceStoktaYok: !f.sadeceStoktaYok }));
  }, []);

  /** Bar'a tıklamak o dilimi filtreye yazar; aynı dilime tekrar tıklamak kaldırır. */
  const handleDilimSec = useCallback(
    (ad: string) => {
      setFilters((f) =>
        boyut === "marka"
          ? { ...f, marka: f.marka === ad ? null : ad }
          : { ...f, kategori: f.kategori === ad ? null : ad }
      );
    },
    [boyut]
  );

  const seciliDilim = boyut === "marka" ? filters.marka : filters.kategori;

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3.5">
        <AppSidebarMobileTrigger />
        <div className="flex min-w-0 items-center gap-3">
          <Typography.Heading level={5} className="shrink-0 tracking-tight">
            Stok Raporları
          </Typography.Heading>
          <span
            className="inline-flex h-6 shrink-0 cursor-help items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 font-mono text-[12.5px] font-medium text-emerald-400 tabular-nums"
            title="Panorama Detaylı Stok Raporu'nun (5430) son çekimindeki ürün sayısı. Tek depo (ANA DEPO) kapsanıyor."
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
            Depo envanteri, marka ve kategori kırılımıyla
          </Typography.Paragraph>
        </div>
      </div>

      <StokFilters
        filters={filters}
        onChange={setFilters}
        markaSecenekleri={markaSecenekleri}
        kategoriSecenekleri={kategoriSecenekleri}
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
        <StokOzet
          ozet={ozet}
          loading={loading}
          onStoktaYokClick={handleStoktaYokToggle}
          stoktaYokAktif={filters.sadeceStoktaYok}
        />

        {/* Grafik ve uyarı paneli sabit yükseklikte: eksen/etiket bandı içeride kalsın. */}
        <div className="grid lg:grid-cols-2 [&>section]:h-[21rem]">
          <StokDagilim
            satirlar={satirlar}
            boyut={boyut}
            onBoyutChange={setBoyut}
            loading={loading}
            onDilimSec={handleDilimSec}
            seciliDilim={seciliDilim}
          />
          <StoktaYokPanel satirlar={stoktaYokSatirlar} loading={loading} />
        </div>

        <StokTable
          satirlar={satirlar}
          loading={loading}
          error={error}
          sort={sort}
          onSortChange={setSort}
        />
      </div>

      <StokDurumCubugu
        ozet={ozet}
        toplamUrun={tumSatirlar.length}
        loading={loading}
      />
    </div>
  );
}
