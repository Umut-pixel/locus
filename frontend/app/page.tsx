"use client";

import { useCallback, useMemo, useState } from "react";

import { CustomerDetailCard } from "@/components/sidebar/CustomerDetailCard";
import { FilterPanel } from "@/components/sidebar/FilterPanel";
import { MobileFilterSheet } from "@/components/sidebar/MobileFilterSheet";
import { RiskLegend } from "@/components/map/RiskLegend";
import { PetshopMap } from "@/components/map/PetshopMap";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMusteriHarita } from "@/hooks/useMusteriHarita";
import { musterilerToGeoJSON } from "@/lib/geojson";
import type { MusteriHarita, RiskDurumu } from "@/lib/types";

export default function Home() {
  const { data: rows, loading, error } = useMusteriHarita();

  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<RiskDurumu[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMusteri, setSelectedMusteri] = useState<MusteriHarita | null>(
    null
  );
  const [highlightedRutKod, setHighlightedRutKod] = useState<string | null>(null);

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
      if (selectedRisks.length > 0 && !selectedRisks.includes(row.risk_durumu)) {
        return false;
      }
      if (query) {
        const haystack = `${row.unvan} ${row.musteri_kodu}`.toLocaleLowerCase("tr");
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [rows, selectedCities, selectedRisks, search]);

  const geojson = useMemo(() => musterilerToGeoJSON(filteredRows), [filteredRows]);

  const stats = useMemo(
    () => ({
      toplam: rows.length,
      gorunen: filteredRows.length,
      riskli: filteredRows.filter((r) => r.risk_durumu === "riskli").length,
    }),
    [rows, filteredRows]
  );

  const hasActiveFilters =
    selectedCities.length > 0 || selectedRisks.length > 0 || search.trim().length > 0;

  const toggleCity = useCallback((city: string) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  }, []);

  const toggleRisk = useCallback((risk: RiskDurumu) => {
    setSelectedRisks((prev) =>
      prev.includes(risk) ? prev.filter((r) => r !== risk) : [...prev, risk]
    );
  }, []);

  const resetFilters = useCallback(() => {
    setSelectedCities([]);
    setSelectedRisks([]);
    setSearch("");
  }, []);

  const handleSelectMusteri = useCallback((musteri: MusteriHarita | null) => {
    setSelectedMusteri(musteri);
    setHighlightedRutKod(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedMusteri(null);
    setHighlightedRutKod(null);
  }, []);

  const filterProps = {
    cities,
    selectedCities,
    onToggleCity: toggleCity,
    selectedRisks,
    onToggleRisk: toggleRisk,
    search,
    onSearchChange: setSearch,
    stats,
    onReset: resetFilters,
    hasActiveFilters,
  };

  return (
    <div className="relative flex h-dvh w-dvw overflow-hidden">
      <aside className="hidden w-80 shrink-0 border-r bg-background lg:block">
        <FilterPanel {...filterProps} />
      </aside>

      <div className="relative flex-1">
        <PetshopMap
          data={geojson}
          selectedMusteriKodu={selectedMusteri?.musteri_kodu ?? null}
          highlightedRutKod={highlightedRutKod}
          onSelectMusteri={handleSelectMusteri}
        />

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 sm:p-4">
          <div className="flex items-start justify-between">
            <div className="pointer-events-auto lg:hidden">
              <MobileFilterSheet {...filterProps} />
            </div>
            <div />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <RiskLegend />
            {selectedMusteri && (
              <CustomerDetailCard
                musteri={selectedMusteri}
                onClose={handleCloseDetail}
                onShowRoute={setHighlightedRutKod}
              />
            )}
          </div>
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
