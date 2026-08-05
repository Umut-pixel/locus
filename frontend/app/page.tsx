"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PotansiyelDetailCard } from "@/components/map/PotansiyelDetailCard";
import { PotansiyelLayerToggle } from "@/components/map/PotansiyelLayerToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ImportStage } from "@/components/import/DataImportFlow";
import { useIsMobileLayout } from "@/hooks/useMediaQuery";
import { useMusteriHarita } from "@/hooks/useMusteriHarita";
import type { MusteriSearchHit } from "@/hooks/useMusteriSearch";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import { usePotansiyelHarita } from "@/hooks/usePotansiyelHarita";
import { musterilerToGeoJSON } from "@/lib/geojson";
import type { UploadResult } from "@/lib/import/types";
import { filterRowsLocally } from "@/lib/map-filter";
import { potansiyellerToGeoJSON } from "@/lib/potansiyel-geojson";
import {
  riskLabelsForMode,
  riskShortLabelsForMode,
  withEffectiveRiskRows,
  type RiskMetricMode,
} from "@/lib/risk-mode";
import type { MusteriHarita, PotansiyelHarita, RiskDurumu } from "@/lib/types";
import {
  buildHighlightSet,
  getHighlightCodes,
  setHighlightCodes,
} from "@/lib/upload-highlight";

const POTANSIYEL_LS_KEY = "locus:show-potansiyel";

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

  const [selectedPotansiyel, setSelectedPotansiyel] =
    useState<PotansiyelHarita | null>(null);
  const [potansiyelAnchor, setPotansiyelAnchor] = useState<PanelAnchor | null>(
    null
  );
  const [showPotansiyel, setShowPotansiyel] = useState(false);
  useEffect(() => {
    try {
      setShowPotansiyel(localStorage.getItem(POTANSIYEL_LS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const handleShowPotansiyelChange = useCallback((active: boolean) => {
    setShowPotansiyel(active);
    try {
      localStorage.setItem(POTANSIYEL_LS_KEY, active ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!active) {
      setSelectedPotansiyel(null);
      setPotansiyelAnchor(null);
    }
  }, []);

  const {
    data: potansiyelRows,
    loading: potansiyelLoading,
    removeLocal: removePotansiyelLocal,
  } = usePotansiyelHarita({ enabled: showPotansiyel });

  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<RiskDurumu | null>(null);
  const [riskMode, setRiskMode] = useState<RiskMetricMode>("sevkiyat");
  const [search, setSearch] = useState("");
  const [focusTarget, setFocusTarget] = useState<{
    musteri_kodu: string;
    lat: number;
    lon: number;
    nonce: number;
  } | null>(null);
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

  const filterState = useMemo(
    () => ({
      cities: selectedCities,
      risk: selectedRisk,
    }),
    [selectedCities, selectedRisk]
  );

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const row of scoredRows) {
      if (row.sehir) set.add(row.sehir);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [scoredRows]);

  const filteredRows = useMemo(
    () => filterRowsLocally(scoredRows, filterState),
    [scoredRows, filterState]
  );

  // Clustering doğru kalsın diye filtreli GeoJSON.
  const geojson = useMemo(
    () => musterilerToGeoJSON(filteredRows, highlightSet),
    [filteredRows, highlightSet]
  );

  const potansiyelGeojson = useMemo(
    () => potansiyellerToGeoJSON(potansiyelRows),
    [potansiyelRows]
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
    selectedCities.length > 0 || selectedRisk !== null;

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
      if (resolved) {
        setSelectedPotansiyel(null);
        setPotansiyelAnchor(null);
      }
      // Pin seçimi veya boş harita tıklaması: import kartını da kapat.
      setImportOpen(false);
      if (!resolved) setImportActivity(null);
    },
    [scoredRows]
  );

  const handleSelectPotansiyel = useCallback(
    (
      potansiyel: PotansiyelHarita | null,
      screenPoint?: { x: number; y: number }
    ) => {
      const resolved =
        potansiyel == null
          ? null
          : (potansiyelRows.find((r) => r.id === String(potansiyel.id)) ??
            potansiyel);
      setSelectedPotansiyel(resolved);
      setPotansiyelAnchor(
        resolved && screenPoint
          ? { x: screenPoint.x, y: screenPoint.y }
          : null
      );
      if (resolved) {
        setSelectedMusteri(null);
        setPanelAnchor(null);
        setHighlightedRutKod(null);
        setImportOpen(false);
        setImportActivity(null);
      }
    },
    [potansiyelRows]
  );

  const handleSearchSelect = useCallback(
    (hit: MusteriSearchHit) => {
      const resolved =
        scoredRows.find((r) => r.musteri_kodu === hit.musteri_kodu) ??
        ({
          ...hit,
          rut_kod: null,
          rut_aciklama: null,
          ziyaret_sira: null,
          son_teslimat_tarihi: null,
          ilk_teslimat_tarihi: null,
          toplam_teslimat_sayisi: 0,
          toplam_agirlik: 0,
          toplam_tutar: 0,
          son_teslimattan_gecen_gun: null,
          durum: null,
          geocode_hassasiyet: null,
        } satisfies MusteriHarita);

      setImportOpen(false);
      setImportActivity(null);
      setHighlightedRutKod(null);
      setSelectedPotansiyel(null);
      setPotansiyelAnchor(null);
      setFocusTarget({
        musteri_kodu: resolved.musteri_kodu,
        lat: resolved.lat,
        lon: resolved.lon,
        nonce: Date.now(),
      });
    },
    [scoredRows]
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedMusteri(null);
    setPanelAnchor(null);
    setHighlightedRutKod(null);
  }, []);

  const handleClosePotansiyel = useCallback(() => {
    setSelectedPotansiyel(null);
    setPotansiyelAnchor(null);
  }, []);

  const handleHidePotansiyel = useCallback(
    async (p: PotansiyelHarita) => {
      const res = await fetch("/api/potansiyel/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? `Gizleme başarısız (${res.status})`);
      }
      removePotansiyelLocal(p.id);
      setSelectedPotansiyel(null);
      setPotansiyelAnchor(null);
    },
    [removePotansiyelLocal]
  );

  const handleToggleImport = useCallback(() => {
    setImportOpen((open) => {
      const next = !open;
      if (next && isMobileLayout) {
        setSelectedMusteri(null);
        setPanelAnchor(null);
        setHighlightedRutKod(null);
        setSelectedPotansiyel(null);
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
      onSearchSelect: handleSearchSelect,
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
      handleSearchSelect,
      stats,
      resetFilters,
      hasActiveFilters,
      importActivity,
      lastUploadResult,
      riskLabels,
      riskShortLabels,
    ]
  );

  const showLegend = !(
    isMobileLayout &&
    (selectedMusteri || selectedPotansiyel)
  );
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
          focusTarget={focusTarget}
          potansiyelData={potansiyelGeojson}
          potansiyelVisible={showPotansiyel}
          selectedPotansiyelId={selectedPotansiyel?.id ?? null}
          onSelectMusteri={handleSelectMusteri}
          onSelectPotansiyel={handleSelectPotansiyel}
        />

        {/* Masaüstü: zoom solunda. Mobilde üst toolbar'a taşındı. */}
        <div className="risk-mode-toggle-anchor hidden lg:flex lg:flex-col lg:items-end lg:gap-1.5">
          <RiskModeToggle value={riskMode} onChange={handleRiskModeChange} />
          <PotansiyelLayerToggle
            active={showPotansiyel}
            onChange={handleShowPotansiyelChange}
            count={showPotansiyel ? potansiyelRows.length : null}
            loading={showPotansiyel && potansiyelLoading}
          />
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
              <div className="pointer-events-auto flex w-fit flex-wrap items-center gap-1.5">
                <RiskModeToggle
                  value={riskMode}
                  onChange={handleRiskModeChange}
                  className="shadow-md"
                />
                <PotansiyelLayerToggle
                  active={showPotansiyel}
                  onChange={handleShowPotansiyelChange}
                  count={showPotansiyel ? potansiyelRows.length : null}
                  loading={showPotansiyel && potansiyelLoading}
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

          <div className="flex items-end justify-end gap-2">
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
            {selectedPotansiyel && potansiyelAnchor && (
              <PotansiyelDetailCard
                key="potansiyel-detail"
                potansiyel={selectedPotansiyel}
                anchor={potansiyelAnchor}
                containerRef={mapAreaRef}
                onClose={handleClosePotansiyel}
                onHide={handleHidePotansiyel}
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
