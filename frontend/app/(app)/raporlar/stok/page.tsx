"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "motion/react";
import { UploadIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { Button } from "@/components/ui/button";
import { SktYaklasanPanel } from "@/components/stok/SktYaklasanPanel";
import { StokDagilim } from "@/components/stok/StokDagilim";
import { StokDurumCubugu } from "@/components/stok/StokDurumCubugu";
import { StokFilters } from "@/components/stok/StokFilters";
import { StokOzet } from "@/components/stok/StokOzet";
import { StokTable } from "@/components/stok/StokTable";
import {
  EMPTY_STOK_FILTERS,
  VARSAYILAN_STOK_SORT,
  useStokRaporu,
  type StokBoyut,
  type StokFilters as StokFiltersTipi,
  type StokSort,
} from "@/hooks/useStokRaporu";
import { useUrunSkt } from "@/hooks/useUrunSkt";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Harita sayfasındaki desen — panel yalnızca açılınca chunk edilsin. */
const DataImportFlow = dynamic(
  () =>
    import("@/components/import/DataImportFlow").then((m) => m.DataImportFlow),
  { ssr: false }
);

/**
 * Detaylı Stok Raporu (5430) — depo envanterinin anlık görüntüsü.
 *
 * Bu veri müşteri/harita modeline bağlanmıyor (konum ya da müşteri alanı
 * yok), o yüzden raporların altında kendi sayfası. Stok × sipariş çaprazı
 * bilinçli olarak kapsam dışı: 5450 yalnızca Fatura'ya daraltılmış durumda,
 * sipariş tipi belge kaynağı yok.
 *
 * SKT sütunu Panorama'dan DEĞİL, fabrikanın 15 günde bir gönderdiği alış
 * raporundan geliyor (Veri Yükle akışı) — bu yüzden başlıkta kapsanan alım
 * aralığı ayrıca gösteriliyor.
 */
export default function StokRaporlariPage() {
  const [filters, setFilters] = useState<StokFiltersTipi>(EMPTY_STOK_FILTERS);
  const [sort, setSort] = useState<StokSort>(VARSAYILAN_STOK_SORT);
  const [boyut, setBoyut] = useState<StokBoyut>("marka");
  const [importOpen, setImportOpen] = useState(false);

  const {
    satirlar,
    tumSatirlar,
    ozet,
    markaSecenekleri,
    kategoriSecenekleri,
    loading,
    error,
  } = useStokRaporu(filters, sort);

  const {
    ozetMap: sktOzetleri,
    meta: sktMeta,
    loading: sktLoading,
    refresh: sktRefresh,
  } = useUrunSkt();

  /** SKT paneli stoğu biten ürünleri elemek için güncel miktara bakıyor. */
  const stokMiktarlari = useMemo(
    () => new Map(tumSatirlar.map((s) => [s.urunKodu, s.miktar])),
    [tumSatirlar]
  );

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

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SktKapsamRozeti
            donemBas={sktMeta.donemBas}
            donemBit={sktMeta.donemBit}
            gunFarki={sktMeta.donemBitGunFarki}
            urunSayisi={sktMeta.urunSayisi}
            loading={sktLoading}
          />
          <Button
            variant={importOpen ? "secondary" : "outline"}
            size="sm"
            aria-pressed={importOpen}
            onClick={() => setImportOpen((v) => !v)}
            className="h-9 gap-1.5 rounded-md px-3 text-[13px]"
            title="Fabrika alış / SKT dosyasını yükle"
          >
            <UploadIcon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Veri Yükle</span>
          </Button>
        </div>
      </div>

      {/* Yükleme paneli overlay — sayfa düzenini itmesin, haritadaki davranışla aynı. */}
      <AnimatePresence>
        {importOpen && (
          <div className="pointer-events-none absolute top-[4.5rem] right-3.5 z-30 flex justify-end">
            <DataImportFlow
              baslik="Fabrika SKT verisi yükle"
              onClose={() => setImportOpen(false)}
              onComplete={sktRefresh}
            />
          </div>
        )}
      </AnimatePresence>

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

        {/*
         * Grafik ve uyarı panelleri sabit yükseklikte: eksen/etiket bandı
         * içeride kalsın. Satırın alt kenarı BURADA çiziliyor — StokDagilim
         * masaüstünde border-b'yi border-r'ye çeviriyor (dikey ayraç);
         * SktYaklasanPanel son sütun olduğu için kendi alt/sağ kenarı yok.
         */}
        <div className="grid border-b border-border lg:grid-cols-2 [&>section]:h-[21rem]">
          <StokDagilim
            satirlar={satirlar}
            boyut={boyut}
            onBoyutChange={setBoyut}
            loading={loading}
            onDilimSec={handleDilimSec}
            seciliDilim={seciliDilim}
          />
          <SktYaklasanPanel
            ozetler={sktOzetleri}
            stokMiktarlari={stokMiktarlari}
            loading={sktLoading}
          />
        </div>

        <StokTable
          satirlar={satirlar}
          loading={loading}
          error={error}
          sort={sort}
          onSortChange={setSort}
          sktOzetleri={sktOzetleri}
          sktLoading={sktLoading}
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

/**
 * SKT verisinin hangi alım aralığını kapsadığı.
 *
 * Panorama otomasyonuna bağlı olmadığı için "tazelik" burada saat cinsinden
 * ölçülemiyor; asıl soru "veri hangi tarihe kadarki alımları görüyor".
 * 2026-08-21'de dosya 20 Mayıs'ta bitiyordu — 3 aylık boşluk ekranda
 * görünmezse "rozet yok = sorun yok" diye okunuyor.
 */
function SktKapsamRozeti({
  donemBas,
  donemBit,
  gunFarki,
  urunSayisi,
  loading,
}: {
  donemBas: string | null;
  donemBit: string | null;
  gunFarki: number | null;
  urunSayisi: number;
  loading: boolean;
}) {
  if (loading || !donemBit) return null;

  // Rapor 15 günde bir geliyor; 45 gün = üç dönem kaçmış demek.
  const bayat = (gunFarki ?? 0) > 45;

  return (
    <span
      className="hidden shrink-0 cursor-help items-center gap-1.5 md:flex"
      title={
        `SKT verisi ${urunSayisi} ürünü kapsıyor; fabrika alış dosyasındaki ` +
        `en son alım ${formatDate(donemBit)}${donemBas ? ` (başlangıç ${formatDate(donemBas)})` : ""}. ` +
        "Bu tarihten sonra gelen ürünlerin SKT'si dosyada yok."
      }
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          bayat ? "bg-amber-400" : "bg-emerald-400"
        )}
        aria-hidden
      />
      <span className="text-[12px] text-muted-foreground">SKT verisi</span>
      <span
        className={cn(
          "font-mono text-[12.5px] font-medium tabular-nums",
          bayat ? "text-amber-400" : "text-foreground"
        )}
      >
        {formatDate(donemBit)}
      </span>
    </span>
  );
}
