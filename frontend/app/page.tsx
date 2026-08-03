"use client";

import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import {
  CustomerDetailPanel,
  type PanelAnchor,
} from "@/components/map/CustomerDetailPanel";
import { FilterPanel } from "@/components/sidebar/FilterPanel";
import { MobileFilterSheet } from "@/components/sidebar/MobileFilterSheet";
import { RiskLegend } from "@/components/map/RiskLegend";
import { RiskModeToggle } from "@/components/map/RiskModeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ImportStage } from "@/components/import/DataImportFlow";
import { useIsMobileLayout } from "@/hooks/useMediaQuery";
import { useMusteriHarita } from "@/hooks/useMusteriHarita";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import { musterilerToGeoJSON } from "@/lib/geojson";
import type { UploadResult } from "@/lib/import/types";
import { filterRowsLocally } from "@/lib/map-filter";
import {
  riskLabelsForMode,
  riskShortLabelsForMode,
  withEffectiveRiskRows,
  type RiskMetricMode,
} from "@/lib/risk-mode";
import type { MusteriHarita, RiskDurumu } from "@/lib/types";
import {
  buildHighlightSet,
  getHighlightCodes,
  setHighlightCodes,
} from "@/lib/upload-highlight";

/** Mapbox ~1.8MB — ilk paint'ten sonra yükle */
const PetshopMap = dynamic(
  () =>
    import("@/components/map/PetshopMap").then((m) => m.PetshopMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex w-56 flex-col gap-2 rounded-2xl border bg-card p-4 shadow-md">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <p className="mt-1 text-xs text-muted-foreground">Harita yükleniyor…</p>
        </div>
      </div>
    ),
  }
);

/** Import paneli yalnızca açılınca chunk edilsin */
const DataImportFlow = dynamic(
  () =>
    import("@/components/import/DataImportFlow").then((m) => m.DataImportFlow),
  { ssr: false }
);

const MAP_OVERLAY_SAFE_PAD = {
  paddingTop: "max(0.5rem, env(safe-area-inset-top))",
  paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
  paddingRight: "max(0.5rem, env(safe-area-inset-right))",
  paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
} as const;

export default function Home() {
  const { data: rows, loading, refreshing, error, refresh } = useMusteriHarita();
  const { label: syncLabel, status: syncStatus } = usePanoramaSyncStatus({
    onTransformApplied: refresh,
  });
  const isMobileLayout = useIsMobileLayout();

  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<RiskDurumu | null>(null);
  const [riskMode, setRiskMode] = useState<RiskMetricMode>("sevkiyat");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedMusteri, setSelectedMusteri] = useState<MusteriHarita | null>(
    null
  );
  const [panelAnchor, setPanelAnchor] = useState<PanelAnchor | null>(null);
  const [highlightedRutKod, setHighlightedRutKod] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importActivity, setImportActivity] = useState<ImportStage | null>(null);
  const [lastUploadResult, setLastUploadResult] = useState<UploadResult | null>(
    null
  );
  const [highlightCodes, setHighlightCodesState] = useState<string[] | null>(
    () => getHighlightCodes()
  );
  const highlightSet = useMemo(
    () => buildHighlightSet(highlightCodes),
    [highlightCodes]
  );

  const mapAreaRef = useRef<HTMLDivElement | null>(null);

  const riskLabels = useMemo(() => riskLabelsForMode(riskMode), [riskMode]);
  const riskShortLabels = useMemo(
    () => riskShortLabelsForMode(riskMode),
    [riskMode]
  );

  const scoredRows = useMemo(
    () => withEffectiveRiskRows(rows, riskMode),
    [rows, riskMode]
  );

  const searchHaystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of scoredRows) {
      map.set(
        row.musteri_kodu,
        `${row.unvan} ${row.musteri_kodu}`.toLocaleLowerCase("tr")
      );
    }
    return map;
  }, [scoredRows]);

  const filterState = useMemo(
    () => ({
      cities: selectedCities,
      risk: selectedRisk,
      search: deferredSearch,
    }),
    [selectedCities, selectedRisk, deferredSearch]
  );

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const row of scoredRows) {
      if (row.sehir) set.add(row.sehir);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [scoredRows]);

  const filteredRows = useMemo(
    () => filterRowsLocally(scoredRows, filterState, searchHaystacks),
    [scoredRows, filterState, searchHaystacks]
  );

  // Clustering doğru kalsın diye filtreli GeoJSON; rows değişince / filtre
  // deferred search ile yeniden kurulur (yazarken her tuşta değil).
  const geojson = useMemo(
    () => musterilerToGeoJSON(filteredRows, highlightSet),
    [filteredRows, highlightSet]
  );

  const handleUploadResult = useCallback((result: UploadResult) => {
    setLastUploadResult(result);
    const codes = result.etkilenenMusteriKodlari ?? [];
    setHighlightCodes(codes.length ? codes : null);
    setHighlightCodesState(codes.length ? codes : null);
  }, []);

  const { stats, hasUpdatedMarkers } = useMemo(() => {
    const dagilim: Record<RiskDurumu, number> = {
      saglikli: 0,
      izlenmeli: 0,
      riskli: 0,
      hic_teslimat_yok: 0,
    };
    let hasUpdated = false;
    for (const row of filteredRows) {
      dagilim[row.risk_durumu] += 1;
      if (!hasUpdated && highlightSet?.has(row.musteri_kodu)) {
        hasUpdated = true;
      }
    }
    return {
      stats: {
        toplam: scoredRows.length,
        gorunen: filteredRows.length,
        riskli: dagilim.riskli,
        dagilim,
      },
      hasUpdatedMarkers: Boolean(highlightSet) && hasUpdated,
    };
  }, [scoredRows, filteredRows, highlightSet]);

  const legendTitle = useMemo(
    () => (riskMode === "borc" ? "Borç durumu" : "Sevkiyat durumu"),
    [riskMode]
  );

  // Mod değişince seçili müşterinin risk bandını güncelle.
  useEffect(() => {
    setSelectedMusteri((prev) => {
      if (!prev) return prev;
      const next = scoredRows.find((r) => r.musteri_kodu === prev.musteri_kodu);
      if (!next || next.risk_durumu === prev.risk_durumu) return prev;
      return next;
    });
  }, [scoredRows]);

  const hasActiveFilters =
    selectedCities.length > 0 ||
    selectedRisk !== null ||
    search.trim().length > 0;

  const toggleCity = useCallback((city: string) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  }, []);

  const resetFilters = useCallback(() => {
    setSelectedCities([]);
    setSelectedRisk(null);
    setSearch("");
  }, []);

  const handleRiskModeChange = useCallback((mode: RiskMetricMode) => {
    setRiskMode(mode);
    setSelectedRisk(null);
  }, []);

  const handleSelectMusteri = useCallback(
    (musteri: MusteriHarita | null, screenPoint?: { x: number; y: number }) => {
      // Harita feature'ı scored olabilir; kaynak satırı kod ile eşle.
      const resolved =
        musteri == null
          ? null
          : (scoredRows.find((r) => r.musteri_kodu === musteri.musteri_kodu) ??
            musteri);
      setSelectedMusteri(resolved);
      setPanelAnchor(
        resolved && screenPoint ? { x: screenPoint.x, y: screenPoint.y } : null
      );
      setHighlightedRutKod(null);
      // Pin seçimi veya boş harita tıklaması: import kartını da kapat.
      setImportOpen(false);
      if (!resolved) setImportActivity(null);
    },
    [scoredRows]
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedMusteri(null);
    setPanelAnchor(null);
    setHighlightedRutKod(null);
  }, []);

  const handleToggleImport = useCallback(() => {
    setImportOpen((open) => {
      const next = !open;
      if (next && isMobileLayout) {
        setSelectedMusteri(null);
        setPanelAnchor(null);
        setHighlightedRutKod(null);
      }
      return next;
    });
  }, [isMobileLayout]);

  const handleCloseImport = useCallback(() => {
    setImportOpen(false);
    setImportActivity(null);
  }, []);

  const filterProps = useMemo(
    () => ({
      cities,
      selectedCities,
      onToggleCity: toggleCity,
      selectedRisk,
      onSelectRisk: setSelectedRisk,
      search,
      onSearchChange: setSearch,
      stats,
      onReset: resetFilters,
      hasActiveFilters,
      importActivity,
      lastUploadResult,
      riskLabels,
      riskShortLabels,
    }),
    [
      cities,
      selectedCities,
      toggleCity,
      selectedRisk,
      search,
      stats,
      resetFilters,
      hasActiveFilters,
      importActivity,
      lastUploadResult,
      riskLabels,
      riskShortLabels,
    ]
  );

  const showLegend = !(isMobileLayout && selectedMusteri);
  const showBlockingLoader = loading && rows.length === 0;

  return (
    <div className="relative flex h-dvh w-full max-w-[100vw] overflow-hidden">
      {!isMobileLayout ? (
        <aside className="hidden w-80 shrink-0 border-r border-sidebar-border bg-sidebar lg:block xl:w-[22.5rem]">
          <FilterPanel {...filterProps} />
        </aside>
      ) : null}

      <div ref={mapAreaRef} className="relative min-w-0 flex-1">
        <PetshopMap
          data={geojson}
          selectedMusteriKodu={selectedMusteri?.musteri_kodu ?? null}
          highlightedRutKod={highlightedRutKod}
          onSelectMusteri={handleSelectMusteri}
        />

        {/* Masaüstü: zoom solunda. Mobilde üst toolbar'a taşındı. */}
        <div className="risk-mode-toggle-anchor hidden lg:block">
          <RiskModeToggle value={riskMode} onChange={handleRiskModeChange} />
        </div>

        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-2 p-2 sm:gap-3 sm:p-3 md:p-4"
          style={MAP_OVERLAY_SAFE_PAD}
        >
          <div className="flex min-h-0 w-full max-w-full flex-col items-stretch gap-1.5 sm:max-w-[22rem] sm:items-start">
            <div className="flex items-center gap-2">
              {isMobileLayout ? (
                <div className="pointer-events-auto">
                  <MobileFilterSheet {...filterProps} />
                </div>
              ) : null}
              <Button
                variant="secondary"
                onClick={handleToggleImport}
                className="pointer-events-auto h-8 gap-1.5 rounded-full border px-2.5 shadow-md"
              >
                <UploadIcon className="size-3.5" />
                <span className="text-xs">Veri yükle</span>
              </Button>
              {refreshing && (
                <span className="pointer-events-none rounded-full border bg-popover/90 px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase shadow-md">
                  Yenileniyor…
                </span>
              )}
              {!refreshing && syncLabel ? (
                <span
                  className={`pointer-events-none max-w-[14rem] truncate rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide shadow-md sm:max-w-none ${
                    syncStatus.syncError
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : syncStatus.transformPending
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                        : "bg-popover/90 text-muted-foreground"
                  }`}
                  title={syncLabel}
                >
                  {syncLabel}
                </span>
              ) : null}
            </div>
            {/* Ayrı satır: dar ekranda menü/yükle arasına sıkışıp kaybolmasın */}
            {isMobileLayout ? (
              <div className="pointer-events-auto w-fit">
                <RiskModeToggle
                  value={riskMode}
                  onChange={handleRiskModeChange}
                  className="shadow-md"
                />
              </div>
            ) : null}
            <AnimatePresence>
              {importOpen && (
                <DataImportFlow
                  onClose={handleCloseImport}
                  onComplete={refresh}
                  onStageChange={setImportActivity}
                  onResult={handleUploadResult}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-end justify-end">
            {showLegend && (
              <RiskLegend
                showUpdatedRing={hasUpdatedMarkers}
                riskLabels={riskLabels}
                title={legendTitle}
              />
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <AnimatePresence>
            {selectedMusteri && panelAnchor && (
              <CustomerDetailPanel
                key="musteri-detail"
                musteri={selectedMusteri}
                anchor={panelAnchor}
                containerRef={mapAreaRef}
                onClose={handleCloseDetail}
                onShowRoute={setHighlightedRutKod}
                riskLabels={riskLabels}
              />
            )}
          </AnimatePresence>
        </div>

        {showBlockingLoader && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 p-4">
            <Card className="w-[min(100%,16rem)]">
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Müşteri verisi yükleniyor...
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {error && rows.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 sm:p-6">
            <Card className="w-full max-w-sm">
              <CardContent>
                <p className="text-sm font-medium text-destructive">
                  Veri yüklenemedi
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <code>frontend/.env.local</code> dosyasındaki Supabase
                  değerlerini kontrol edin.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
