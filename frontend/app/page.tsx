"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import {
  CustomerDetailPanel,
  type PanelAnchor,
} from "@/components/map/CustomerDetailPanel";
import { DataImportFlow } from "@/components/import/DataImportFlow";
import { FilterPanel } from "@/components/sidebar/FilterPanel";
import { MobileFilterSheet } from "@/components/sidebar/MobileFilterSheet";
import { RiskLegend } from "@/components/map/RiskLegend";
import { PetshopMap } from "@/components/map/PetshopMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMusteriHarita } from "@/hooks/useMusteriHarita";
import { musterilerToGeoJSON } from "@/lib/geojson";
import type { MusteriHarita, RiskDurumu } from "@/lib/types";

export default function Home() {
  const { data: rows, loading, error } = useMusteriHarita();

  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<RiskDurumu | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMusteri, setSelectedMusteri] = useState<MusteriHarita | null>(
    null
  );
  const [panelAnchor, setPanelAnchor] = useState<PanelAnchor | null>(null);
  const [highlightedRutKod, setHighlightedRutKod] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const mapAreaRef = useRef<HTMLDivElement | null>(null);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.sehir) set.add(row.sehir);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr");
    return rows.filter((row) => {
      if (selectedCities.length > 0 && (!row.sehir || !selectedCities.includes(row.sehir))) {
        return false;
      }
      if (selectedRisk && row.risk_durumu !== selectedRisk) {
        return false;
      }
      if (query) {
        const haystack = `${row.unvan} ${row.musteri_kodu}`.toLocaleLowerCase("tr");
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [rows, selectedCities, selectedRisk, search]);

  const geojson = useMemo(() => musterilerToGeoJSON(filteredRows), [filteredRows]);

  const stats = useMemo(() => {
    const dagilim: Record<RiskDurumu, number> = {
      saglikli: 0,
      izlenmeli: 0,
      riskli: 0,
      hic_teslimat_yok: 0,
    };
    for (const row of filteredRows) {
      dagilim[row.risk_durumu] += 1;
    }
    return {
      toplam: rows.length,
      gorunen: filteredRows.length,
      riskli: dagilim.riskli,
      dagilim,
    };
  }, [rows, filteredRows]);

  const hasActiveFilters =
    selectedCities.length > 0 || selectedRisk !== null || search.trim().length > 0;

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

  const handleSelectMusteri = useCallback(
    (musteri: MusteriHarita | null, screenPoint?: { x: number; y: number }) => {
      setSelectedMusteri(musteri);
      setPanelAnchor(
        musteri && screenPoint
          ? { x: screenPoint.x, y: screenPoint.y, instant: false }
          : null
      );
      setHighlightedRutKod(null);
    },
    []
  );

  const handleAnchorMove = useCallback((point: { x: number; y: number }) => {
    setPanelAnchor({ x: point.x, y: point.y, instant: true });
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedMusteri(null);
    setPanelAnchor(null);
    setHighlightedRutKod(null);
  }, []);

  const filterProps = {
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
  };

  return (
    <div className="relative flex h-dvh w-dvw overflow-hidden">
      <aside className="hidden w-80 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <FilterPanel {...filterProps} />
      </aside>

      <div ref={mapAreaRef} className="relative flex-1">
        <PetshopMap
          data={geojson}
          selectedMusteriKodu={selectedMusteri?.musteri_kodu ?? null}
          selectedLngLat={
            selectedMusteri ? [selectedMusteri.lon, selectedMusteri.lat] : null
          }
          highlightedRutKod={highlightedRutKod}
          onSelectMusteri={handleSelectMusteri}
          onAnchorMove={handleAnchorMove}
        />

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 sm:p-4">
          <div className="flex min-h-0 flex-col items-start gap-3">
            <div className="flex items-center gap-2">
              <div className="pointer-events-auto lg:hidden">
                <MobileFilterSheet {...filterProps} />
              </div>
              <Button
                variant="secondary"
                onClick={() => setImportOpen((open) => !open)}
                className="pointer-events-auto gap-1.5 rounded-full border shadow-md"
              >
                <UploadIcon className="size-3.5" />
                Veri yükle
              </Button>
            </div>
            <AnimatePresence>
              {importOpen && (
                <DataImportFlow onClose={() => setImportOpen(false)} />
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <RiskLegend />
          </div>
        </div>

        {/* Tıklanan noktanın yanında açılan contextual detay paneli */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <AnimatePresence>
            {selectedMusteri && panelAnchor && (
              <CustomerDetailPanel
                key={selectedMusteri.musteri_kodu}
                musteri={selectedMusteri}
                anchor={panelAnchor}
                containerRef={mapAreaRef}
                onClose={handleCloseDetail}
                onShowRoute={setHighlightedRutKod}
              />
            )}
          </AnimatePresence>
        </div>

        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
            <Card className="w-64">
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

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6">
            <Card className="max-w-sm">
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
