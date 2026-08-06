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
import { TipKanalToggle } from "@/components/map/TipKanalToggle";
import { PotansiyelDetailCard } from "@/components/map/PotansiyelDetailCard";
import { PotansiyelLayerToggle } from "@/components/map/PotansiyelLayerToggle";
import { LoginEnterTransition } from "@/components/auth/LoginEnterTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ImportStage } from "@/components/import/DataImportFlow";
import { useIsMobileLayout } from "@/hooks/useMediaQuery";
import { useMusteriFavoriler } from "@/hooks/useMusteriFavoriler";
import { useMusteriGizlenenler } from "@/hooks/useMusteriGizlenenler";
import { useMusteriHarita } from "@/hooks/useMusteriHarita";
import type { MusteriSearchHit } from "@/hooks/useMusteriSearch";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import { usePotansiyelFavoriler } from "@/hooks/usePotansiyelFavoriler";
import { usePotansiyelGizlenenler } from "@/hooks/usePotansiyelGizlenenler";
import { usePotansiyelHarita } from "@/hooks/usePotansiyelHarita";
import type { GizlenenItem } from "@/components/sidebar/GizlenenList";
import type { SonraBakItem } from "@/components/sidebar/PotansiyelFavoriList";
import { musterilerToGeoJSON } from "@/lib/geojson";
import { boundsForSehir } from "@/lib/import/cities";
import type { UploadResult } from "@/lib/import/types";
import { filterRowsLocally } from "@/lib/map-filter";
import { potansiyellerToGeoJSON } from "@/lib/potansiyel-geojson";
import {
  riskLabelsForMode,
  riskShortLabelsForMode,
  withEffectiveRiskRows,
  type RiskMetricMode,
} from "@/lib/risk-mode";
import {
  DEFAULT_TIP_FILTER,
  isTipFilterActive,
  tipKanalFromPrimaryType,
  tipPassesFilter,
  tipRingVisible,
  type TipKanalFilter,
} from "@/lib/tip-style";
import type {
  MusteriHarita,
  PotansiyelHarita,
  RiskDurumu,
} from "@/lib/types";
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

  const [selectedPotansiyel, setSelectedPotansiyel] =
    useState<PotansiyelHarita | null>(null);
  const [potansiyelAnchor, setPotansiyelAnchor] = useState<PanelAnchor | null>(
    null
  );
  const [showPotansiyel, setShowPotansiyel] = useState(false);
  const [onlyFavoriler, setOnlyFavoriler] = useState(false);
  const [onlyGizlenen, setOnlyGizlenen] = useState(false);
  /** Arama / listeden seçilen gizlenen — haritada geçici görünür. */
  const [revealMusteriKodu, setRevealMusteriKodu] = useState<string | null>(
    null
  );
  const [revealPotansiyelId, setRevealPotansiyelId] = useState<string | null>(
    null
  );
  const [potansiyelFocusTarget, setPotansiyelFocusTarget] = useState<{
    id: string;
    lat: number;
    lon: number;
    nonce: number;
  } | null>(null);

  const handleShowPotansiyelChange = useCallback((active: boolean) => {
    setShowPotansiyel(active);
    if (!active) {
      setSelectedPotansiyel(null);
      setPotansiyelAnchor(null);
      setOnlyFavoriler(false);
    }
  }, []);

  const {
    data: potansiyelRows,
    loading: potansiyelLoading,
  } = usePotansiyelHarita({ enabled: showPotansiyel });

  const {
    items: potansiyelFavoriler,
    favoriIds: potansiyelFavoriIds,
    loading: potansiyelFavorilerLoading,
    toggle: togglePotansiyelFavori,
    updateNote: updatePotansiyelFavoriNote,
    isFavori: isPotansiyelFavori,
    getNote: getPotansiyelFavoriNote,
  } = usePotansiyelFavoriler();

  const {
    items: musteriFavoriler,
    favoriKodlari: musteriFavoriKodlari,
    loading: musteriFavorilerLoading,
    toggle: toggleMusteriFavori,
    updateNote: updateMusteriFavoriNote,
    isFavori: isMusteriFavori,
    getNote: getMusteriFavoriNote,
  } = useMusteriFavoriler();

  const {
    items: musteriGizlenenler,
    gizlenenKodlari: musteriGizlenenKodlari,
    loading: musteriGizlenenLoading,
    toggle: toggleMusteriGizle,
    isGizlenen: isMusteriGizlenen,
  } = useMusteriGizlenenler();

  const {
    items: potansiyelGizlenenler,
    gizlenenIds: potansiyelGizlenenIds,
    loading: potansiyelGizlenenLoading,
    toggle: togglePotansiyelGizle,
    isGizlenen: isPotansiyelGizlenen,
  } = usePotansiyelGizlenenler();

  const favorilerLoading = potansiyelFavorilerLoading || musteriFavorilerLoading;
  const gizlenenLoading = musteriGizlenenLoading || potansiyelGizlenenLoading;

  const sonraBakItems = useMemo((): SonraBakItem[] => {
    const merged: SonraBakItem[] = [
      ...musteriFavoriler.map((item) => ({
        kind: "musteri" as const,
        item,
      })),
      ...potansiyelFavoriler.map((item) => ({
        kind: "potansiyel" as const,
        item,
      })),
    ];
    merged.sort((a, b) => {
      const ta = a.item.olusturulma;
      const tb = b.item.olusturulma;
      return tb.localeCompare(ta);
    });
    return merged;
  }, [musteriFavoriler, potansiyelFavoriler]);

  const gizlenenItems = useMemo((): GizlenenItem[] => {
    const merged: GizlenenItem[] = [
      ...musteriGizlenenler.map((item) => ({
        kind: "musteri" as const,
        item,
      })),
      ...potansiyelGizlenenler.map((item) => ({
        kind: "potansiyel" as const,
        item,
      })),
    ];
    merged.sort((a, b) => {
      const ta = a.item.olusturulma;
      const tb = b.item.olusturulma;
      return tb.localeCompare(ta);
    });
    return merged;
  }, [musteriGizlenenler, potansiyelGizlenenler]);

  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<RiskDurumu | null>(null);
  /** Varsayılan: YEM TOPTAN vb. haritada yok; yalnızca petshop + veteriner. */
  const [includeDigerKanallar, setIncludeDigerKanallar] = useState(false);
  const [tipFilter, setTipFilter] =
    useState<TipKanalFilter>(DEFAULT_TIP_FILTER);
  const [riskMode, setRiskMode] = useState<RiskMetricMode>("sevkiyat");
  const [search, setSearch] = useState("");
  const [focusTarget, setFocusTarget] = useState<{
    musteri_kodu: string;
    lat: number;
    lon: number;
    nonce: number;
  } | null>(null);
  const [regionFocus, setRegionFocus] = useState<{
    bounds: [[number, number], [number, number]];
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
      includeDigerKanallar,
      tipFilter,
    }),
    [selectedCities, selectedRisk, includeDigerKanallar, tipFilter]
  );

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const row of scoredRows) {
      if (row.sehir) set.add(row.sehir);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [scoredRows]);

  const filteredRows = useMemo(() => {
    let base = filterRowsLocally(scoredRows, filterState);

    if (onlyGizlenen) {
      base = base.filter((r) => musteriGizlenenKodlari.has(r.musteri_kodu));
    } else {
      base = base.filter(
        (r) =>
          !musteriGizlenenKodlari.has(r.musteri_kodu) ||
          r.musteri_kodu === revealMusteriKodu
      );
    }

    if (onlyFavoriler) {
      base = base.filter((r) => musteriFavoriKodlari.has(r.musteri_kodu));
    }
    return base;
  }, [
    scoredRows,
    filterState,
    onlyFavoriler,
    musteriFavoriKodlari,
    onlyGizlenen,
    musteriGizlenenKodlari,
    revealMusteriKodu,
  ]);

  // Clustering doğru kalsın diye filtreli GeoJSON.
  const geojson = useMemo(
    () => musterilerToGeoJSON(filteredRows, highlightSet, musteriFavoriKodlari),
    [filteredRows, highlightSet, musteriFavoriKodlari]
  );

  const potansiyelGeojson = useMemo(() => {
    let next = onlyFavoriler
      ? potansiyelRows.filter((r) => potansiyelFavoriIds.has(r.id))
      : potansiyelRows;
    next = next.filter((r) =>
      tipPassesFilter(
        tipKanalFromPrimaryType(r.primary_type),
        tipFilter,
        includeDigerKanallar
      )
    );
    if (onlyGizlenen) {
      next = next.filter((r) => potansiyelGizlenenIds.has(r.id));
    } else {
      next = next.filter(
        (r) =>
          !potansiyelGizlenenIds.has(r.id) || r.id === revealPotansiyelId
      );
    }
    return potansiyellerToGeoJSON(next, potansiyelFavoriIds);
  }, [
    potansiyelRows,
    potansiyelFavoriIds,
    onlyFavoriler,
    tipFilter,
    includeDigerKanallar,
    onlyGizlenen,
    potansiyelGizlenenIds,
    revealPotansiyelId,
  ]);

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

  // Favori focus erken açılırsa stub satırı harita verisi gelince zenginleştir.
  useEffect(() => {
    setSelectedPotansiyel((prev) => {
      if (!prev) return prev;
      return potansiyelRows.find((r) => r.id === prev.id) ?? prev;
    });
  }, [potansiyelRows]);

  const hasActiveFilters =
    selectedCities.length > 0 ||
    selectedRisk !== null ||
    includeDigerKanallar ||
    isTipFilterActive(tipFilter);

  const toggleCity = useCallback(
    (city: string) => {
      const removing = selectedCities.includes(city);
      if (removing) {
        setSelectedCities((prev) => prev.filter((c) => c !== city));
        return;
      }
      setSelectedCities((prev) =>
        prev.includes(city) ? prev : [...prev, city]
      );
      const bounds = boundsForSehir(scoredRows, city);
      if (bounds) {
        setRegionFocus({ bounds, nonce: Date.now() });
      }
    },
    [selectedCities, scoredRows]
  );

  const resetFilters = useCallback(() => {
    setSelectedCities([]);
    setSelectedRisk(null);
    setIncludeDigerKanallar(false);
    setTipFilter(DEFAULT_TIP_FILTER);
    setOnlyGizlenen(false);
    setRevealMusteriKodu(null);
    setRevealPotansiyelId(null);
    setSearch("");
  }, []);

  const handleRiskModeChange = useCallback((mode: RiskMetricMode) => {
    setRiskMode(mode);
    setSelectedRisk(null);
  }, []);

  const handleTipFilterChange = useCallback((next: TipKanalFilter) => {
    setTipFilter(next);
  }, []);

  const showTipRing = tipRingVisible(tipFilter);

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

      if (musteriGizlenenKodlari.has(resolved.musteri_kodu)) {
        setRevealMusteriKodu(resolved.musteri_kodu);
      }

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
    [scoredRows, musteriGizlenenKodlari]
  );

  const handlePotansiyelSearchSelect = useCallback(
    (hit: PotansiyelHarita) => {
      setImportOpen(false);
      setImportActivity(null);
      setHighlightedRutKod(null);
      setSelectedMusteri(null);
      setPanelAnchor(null);
      setShowPotansiyel(true);
      if (potansiyelGizlenenIds.has(hit.id)) {
        setRevealPotansiyelId(hit.id);
      }
      setPotansiyelFocusTarget({
        id: hit.id,
        lat: hit.lat,
        lon: hit.lon,
        nonce: Date.now(),
      });
    },
    [potansiyelGizlenenIds]
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedMusteri(null);
    setPanelAnchor(null);
    setHighlightedRutKod(null);
    setRevealMusteriKodu(null);
  }, []);

  const handleClosePotansiyel = useCallback(() => {
    setSelectedPotansiyel(null);
    setPotansiyelAnchor(null);
    setRevealPotansiyelId(null);
  }, []);

  const handleTogglePotansiyelGizle = useCallback(
    async (p: PotansiyelHarita) => {
      const wasHidden = isPotansiyelGizlenen(p.id);
      await togglePotansiyelGizle(p.id, {
        snapshot: {
          gizle_id: "",
          olusturulma: new Date().toISOString(),
          id: p.id,
          kaynak_id: p.kaynak_id,
          isim: p.isim,
          adres: p.adres,
          il: p.il,
          ilce: p.ilce,
          lat: p.lat,
          lon: p.lon,
          primary_type: p.primary_type,
          google_types: p.google_types,
          kalite_bayragi: p.kalite_bayragi,
          tarandigi_tarih: p.tarandigi_tarih,
        },
      });
      if (!wasHidden) {
        // Yeni gizlendi → panel kapat, reveal temizle
        setRevealPotansiyelId(null);
        setSelectedPotansiyel(null);
        setPotansiyelAnchor(null);
      } else {
        setRevealPotansiyelId(null);
      }
    },
    [togglePotansiyelGizle, isPotansiyelGizlenen]
  );

  const handleToggleMusteriGizle = useCallback(
    async (m: MusteriHarita) => {
      const wasHidden = isMusteriGizlenen(m.musteri_kodu);
      await toggleMusteriGizle(m.musteri_kodu, {
        snapshot: {
          gizle_id: "",
          olusturulma: new Date().toISOString(),
          musteri_kodu: m.musteri_kodu,
          unvan: m.unvan,
          adres: m.adres ?? null,
          sehir: m.sehir,
          ilce: m.ilce,
          lat: m.lat,
          lon: m.lon,
          risk_durumu: m.risk_durumu,
        },
      });
      if (!wasHidden) {
        setRevealMusteriKodu(null);
        setSelectedMusteri(null);
        setPanelAnchor(null);
      } else {
        setRevealMusteriKodu(null);
      }
    },
    [toggleMusteriGizle, isMusteriGizlenen]
  );

  const handleTogglePotansiyelFavori = useCallback(
    async (p: PotansiyelHarita) => {
      await togglePotansiyelFavori(p.id, {
        snapshot: {
          favori_id: "",
          not_metni: null,
          olusturulma: new Date().toISOString(),
          id: p.id,
          kaynak_id: p.kaynak_id,
          isim: p.isim,
          adres: p.adres,
          il: p.il,
          ilce: p.ilce,
          lat: p.lat,
          lon: p.lon,
          primary_type: p.primary_type,
          google_types: p.google_types,
          kalite_bayragi: p.kalite_bayragi,
          tarandigi_tarih: p.tarandigi_tarih,
        },
      });
    },
    [togglePotansiyelFavori]
  );

  const handleUpdatePotansiyelFavoriNot = useCallback(
    async (p: PotansiyelHarita, notMetni: string | null) => {
      await updatePotansiyelFavoriNote(p.id, notMetni);
    },
    [updatePotansiyelFavoriNote]
  );

  const handleToggleMusteriFavori = useCallback(
    async (m: MusteriHarita) => {
      await toggleMusteriFavori(m.musteri_kodu, {
        snapshot: {
          favori_id: "",
          not_metni: null,
          olusturulma: new Date().toISOString(),
          musteri_kodu: m.musteri_kodu,
          unvan: m.unvan,
          adres: m.adres ?? null,
          sehir: m.sehir,
          ilce: m.ilce,
          lat: m.lat,
          lon: m.lon,
          risk_durumu: m.risk_durumu,
        },
      });
    },
    [toggleMusteriFavori]
  );

  const handleUpdateMusteriFavoriNot = useCallback(
    async (m: MusteriHarita, notMetni: string | null) => {
      await updateMusteriFavoriNote(m.musteri_kodu, notMetni);
    },
    [updateMusteriFavoriNote]
  );

  const handleOnlyFavorilerChange = useCallback((value: boolean) => {
    setOnlyFavoriler(value);
    if (value) {
      setShowPotansiyel(true);
      setOnlyGizlenen(false);
    }
  }, []);

  const handleOnlyGizlenenChange = useCallback((value: boolean) => {
    setOnlyGizlenen(value);
    if (value) {
      setOnlyFavoriler(false);
      setRevealMusteriKodu(null);
      setRevealPotansiyelId(null);
      if (potansiyelGizlenenIds.size > 0) setShowPotansiyel(true);
    }
  }, [potansiyelGizlenenIds.size]);

  const handleFavoriSelect = useCallback((entry: SonraBakItem) => {
    setImportOpen(false);
    setImportActivity(null);
    setHighlightedRutKod(null);
    if (entry.kind === "musteri") {
      const item = entry.item;
      setSelectedPotansiyel(null);
      setPotansiyelAnchor(null);
      if (musteriGizlenenKodlari.has(item.musteri_kodu)) {
        setRevealMusteriKodu(item.musteri_kodu);
      }
      setFocusTarget({
        musteri_kodu: item.musteri_kodu,
        lat: item.lat,
        lon: item.lon,
        nonce: Date.now(),
      });
      return;
    }
    setShowPotansiyel(true);
    setSelectedMusteri(null);
    setPanelAnchor(null);
    if (potansiyelGizlenenIds.has(entry.item.id)) {
      setRevealPotansiyelId(entry.item.id);
    }
    setPotansiyelFocusTarget({
      id: entry.item.id,
      lat: entry.item.lat,
      lon: entry.item.lon,
      nonce: Date.now(),
    });
  }, [musteriGizlenenKodlari, potansiyelGizlenenIds]);

  const handleGizlenenSelect = useCallback((entry: GizlenenItem) => {
    setImportOpen(false);
    setImportActivity(null);
    setHighlightedRutKod(null);
    if (entry.kind === "musteri") {
      const item = entry.item;
      setRevealMusteriKodu(item.musteri_kodu);
      setSelectedPotansiyel(null);
      setPotansiyelAnchor(null);
      setFocusTarget({
        musteri_kodu: item.musteri_kodu,
        lat: item.lat,
        lon: item.lon,
        nonce: Date.now(),
      });
      return;
    }
    setShowPotansiyel(true);
    setRevealPotansiyelId(entry.item.id);
    setSelectedMusteri(null);
    setPanelAnchor(null);
    setPotansiyelFocusTarget({
      id: entry.item.id,
      lat: entry.item.lat,
      lon: entry.item.lon,
      nonce: Date.now(),
    });
  }, []);

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
      showPotansiyel,
      potansiyelRows,
      potansiyelLoading,
      potansiyelGizlenenIds,
      onPotansiyelSearchSelect: handlePotansiyelSearchSelect,
      stats,
      onReset: resetFilters,
      hasActiveFilters,
      importActivity,
      lastUploadResult,
      riskLabels,
      riskShortLabels,
      includeDigerKanallar,
      onIncludeDigerKanallarChange: setIncludeDigerKanallar,
      favoriler: sonraBakItems,
      favorilerLoading,
      onlyFavoriler,
      onOnlyFavorilerChange: handleOnlyFavorilerChange,
      onFavoriSelect: handleFavoriSelect,
      gizlenen: gizlenenItems,
      gizlenenLoading,
      gizlenenKodlari: musteriGizlenenKodlari,
      onlyGizlenen,
      onOnlyGizlenenChange: handleOnlyGizlenenChange,
      onGizlenenSelect: handleGizlenenSelect,
    }),
    [
      cities,
      selectedCities,
      toggleCity,
      selectedRisk,
      search,
      handleSearchSelect,
      showPotansiyel,
      potansiyelRows,
      potansiyelLoading,
      potansiyelGizlenenIds,
      handlePotansiyelSearchSelect,
      stats,
      resetFilters,
      hasActiveFilters,
      importActivity,
      lastUploadResult,
      riskLabels,
      riskShortLabels,
      includeDigerKanallar,
      sonraBakItems,
      favorilerLoading,
      onlyFavoriler,
      handleOnlyFavorilerChange,
      handleFavoriSelect,
      gizlenenItems,
      gizlenenLoading,
      musteriGizlenenKodlari,
      onlyGizlenen,
      handleOnlyGizlenenChange,
      handleGizlenenSelect,
    ]
  );

  const showLegend = !(
    isMobileLayout &&
    (selectedMusteri || selectedPotansiyel)
  );
  const showBlockingLoader = loading && rows.length === 0;

  return (
    <div className="relative flex h-dvh w-full max-w-[100vw] overflow-hidden">
      <LoginEnterTransition />
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
          regionFocus={regionFocus}
          potansiyelFocusTarget={potansiyelFocusTarget}
          potansiyelData={potansiyelGeojson}
          potansiyelVisible={showPotansiyel}
          selectedPotansiyelId={selectedPotansiyel?.id ?? null}
          showTipRing={showTipRing}
          onSelectMusteri={handleSelectMusteri}
          onSelectPotansiyel={handleSelectPotansiyel}
        />

        {/* Masaüstü: zoom solunda. Mobilde üst toolbar'a taşındı. */}
        <div className="risk-mode-toggle-anchor hidden lg:flex lg:flex-col lg:items-end lg:gap-1.5">
          <RiskModeToggle value={riskMode} onChange={handleRiskModeChange} />
          <TipKanalToggle
            value={tipFilter}
            onChange={handleTipFilterChange}
          />
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
                className="pointer-events-auto h-10 gap-1.5 rounded-full border px-3 shadow-md lg:h-8 lg:px-2.5"
              >
                <UploadIcon className="size-4 lg:size-3.5" />
                <span className="text-[13px] lg:text-xs">Veri yükle</span>
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
              <div className="pointer-events-auto flex w-fit flex-col items-start gap-1.5">
                <RiskModeToggle
                  value={riskMode}
                  onChange={handleRiskModeChange}
                  className="shadow-md"
                />
                <TipKanalToggle
                  value={tipFilter}
                  onChange={handleTipFilterChange}
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

          <div className="mb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-end justify-end gap-2 sm:mb-0">
            {showLegend && (
              <RiskLegend
                showUpdatedRing={hasUpdatedMarkers}
                showTipRing={showTipRing}
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
                isFavori={isMusteriFavori(selectedMusteri.musteri_kodu)}
                favoriNot={getMusteriFavoriNote(selectedMusteri.musteri_kodu)}
                onToggleFavori={handleToggleMusteriFavori}
                onUpdateFavoriNot={handleUpdateMusteriFavoriNot}
                isGizlenen={isMusteriGizlenen(selectedMusteri.musteri_kodu)}
                onToggleGizle={handleToggleMusteriGizle}
              />
            )}
            {selectedPotansiyel && potansiyelAnchor && (
              <PotansiyelDetailCard
                key="potansiyel-detail"
                potansiyel={selectedPotansiyel}
                anchor={potansiyelAnchor}
                containerRef={mapAreaRef}
                onClose={handleClosePotansiyel}
                isGizlenen={isPotansiyelGizlenen(selectedPotansiyel.id)}
                onToggleGizle={handleTogglePotansiyelGizle}
                isFavori={isPotansiyelFavori(selectedPotansiyel.id)}
                favoriNot={getPotansiyelFavoriNote(selectedPotansiyel.id)}
                onToggleFavori={handleTogglePotansiyelFavori}
                onUpdateFavoriNot={handleUpdatePotansiyelFavoriNot}
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
