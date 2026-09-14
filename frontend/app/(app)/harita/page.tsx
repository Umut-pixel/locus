"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Typography } from "@heroui/react";

import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import {
  CustomerDetailPanel,
  type PanelAnchor,
} from "@/components/map/CustomerDetailPanel";
import { FilterPanel } from "@/components/sidebar/FilterPanel";
import { IlSecimBari } from "@/components/map/IlSecimBari";
import { MapLayersControl } from "@/components/map/MapLayersControl";
import { PotansiyelAraLauncher } from "@/components/map/PotansiyelAraLauncher";
import { TaramaOnayKarti } from "@/components/map/TaramaOnayKarti";
import { RiskLegend } from "@/components/map/RiskLegend";
import { PotansiyelDetailCard } from "@/components/map/PotansiyelDetailCard";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ImportStage } from "@/components/import/DataImportFlow";
import { CanliAracKarti } from "@/components/rota/CanliAracKarti";
import { useCanliAracKonumlari } from "@/hooks/useCanliAracKonumlari";
import { useIsMobileLayout } from "@/hooks/useMediaQuery";
import { useMusteriFavoriler } from "@/hooks/useMusteriFavoriler";
import { useMusteriGizlenenler } from "@/hooks/useMusteriGizlenenler";
import { useMusteriHarita } from "@/hooks/useMusteriHarita";
import type { MusteriSearchHit } from "@/hooks/useMusteriSearch";
import { usePanoramaSyncStatus } from "@/hooks/usePanoramaSyncStatus";
import { usePotansiyelFavoriler } from "@/hooks/usePotansiyelFavoriler";
import { usePotansiyelGizlenenler } from "@/hooks/usePotansiyelGizlenenler";
import { usePotansiyelHarita } from "@/hooks/usePotansiyelHarita";
import { usePotansiyelTarama } from "@/hooks/usePotansiyelTarama";
import type { GizlenenItem } from "@/components/sidebar/GizlenenList";
import type { SonraBakItem } from "@/components/sidebar/PotansiyelFavoriList";
import { musterilerToGeoJSON } from "@/lib/geojson";
import { boundsForSehir } from "@/lib/import/cities";
import type { UploadResult } from "@/lib/import/types";
import { ilBounds, ilSinirlariniYukle } from "@/lib/map-il-layers";
import { filterRowsLocally } from "@/lib/map-filter";
import { potansiyellerToGeoJSON } from "@/lib/potansiyel-geojson";
import type { IlOnBilgi, TaramaOnizleme } from "@/lib/potansiyel-tarama";
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
  /**
   * Arvento canlı araç konumları — müşteri haritasında da görünsün.
   * Müşteri verisinden bağımsız: müşteri katmanı yüklenmese bile araçlar çizilir.
   */
  const { konumlar: canliAraclar, yukleniyor: canliYukleniyor } =
    useCanliAracKonumlari();
  /** Karttan odaklanılan araç — listede işaretli kalsın. */
  const [odakliCanliNode, setOdakliCanliNode] = useState<string | null>(null);
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
    // `refresh` bilerek aliniyor: modul seviyesinde cache var, tarama bitince
    // duz re-render bayat veri gosterirdi (usePanoramaSyncStatus ile ayni idiom).
    refresh: refreshPotansiyel,
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

  // --- "Potansiyel musteri ara" modu -------------------------------------
  // kapali -> yukleniyor (il sinirlari) -> seciliyor -> onay -> gonderiliyor
  const [ilModu, setIlModu] = useState<
    "kapali" | "yukleniyor" | "seciliyor" | "onay" | "gonderiliyor"
  >("kapali");
  const [secilenPlaka, setSecilenPlaka] = useState<number | null>(null);
  const [ilOnBilgi, setIlOnBilgi] = useState<IlOnBilgi | null>(null);
  const [onayHata, setOnayHata] = useState<string | null>(null);
  const [ilBoundsFocus, setIlBoundsFocus] = useState<{
    bounds: [[number, number], [number, number]];
    nonce: number;
  } | null>(null);
  const tarama = usePotansiyelTarama();

  const ilModuKapat = useCallback(() => {
    setIlModu("kapali");
    setSecilenPlaka(null);
    setIlOnBilgi(null);
    setOnayHata(null);
    setIlBoundsFocus(null);
  }, []);

  const handleIlModuToggle = useCallback(() => {
    if (ilModu !== "kapali") {
      ilModuKapat();
      return;
    }
    // Mod harita ustunu devraliyor: acik kartlar kapansin.
    setSelectedMusteri(null);
    setPanelAnchor(null);
    setSelectedPotansiyel(null);
    setPotansiyelAnchor(null);
    setIlModu("yukleniyor");
    tarama.kotayiTazele();
    void ilSinirlariniYukle()
      .then(() => setIlModu((m) => (m === "yukleniyor" ? "seciliyor" : m)))
      .catch(() => {
        setOnayHata("Il sinirlari yuklenemedi.");
        setIlModu((m) => (m === "yukleniyor" ? "seciliyor" : m));
      });
  }, [ilModu, ilModuKapat, tarama]);

  const handleIlSec = useCallback((plaka: number) => {
    setSecilenPlaka(plaka);
    setIlOnBilgi(null);
    setOnayHata(null);
    setIlModu("onay");

    void ilSinirlariniYukle().then((fc) => {
      const kutu = ilBounds(fc, plaka);
      if (kutu) {
        setIlBoundsFocus({
          bounds: kutu as [[number, number], [number, number]],
          nonce: Date.now(),
        });
      }
    });

    void fetch(`/api/potansiyel/tarama?plaka=${plaka}`)
      .then((r) => r.json() as Promise<TaramaOnizleme & { error?: string }>)
      .then((g) => {
        if (g.error) {
          setOnayHata(g.error);
          return;
        }
        if (g.il) setIlOnBilgi(g.il);
      })
      .catch(() => setOnayHata("Il bilgisi okunamadi."));
  }, []);

  const handleTaramaBaslat = useCallback(async () => {
    if (secilenPlaka == null || ilOnBilgi == null) return;
    setIlModu("gonderiliyor");
    setOnayHata(null);
    try {
      const res = await fetch("/api/potansiyel/tarama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaka: secilenPlaka }),
      });
      const govde = (await res.json().catch(() => null)) as
        | { ok?: boolean; runId?: string; il?: string; error?: string }
        | null;

      if (!res.ok || !govde?.runId) {
        // 409/429 satir ici gosterilmeli: kullanici neden reddedildigini
        // kartta gorsun, toast'a dusen bir hata baglami kaybettirirdi.
        setOnayHata(govde?.error ?? "Tarama baslatilamadi.");
        setIlModu("onay");
        return;
      }

      tarama.izle({
        runId: govde.runId,
        il: govde.il ?? ilOnBilgi.ad,
        plaka: secilenPlaka,
        basladiAt: Date.now(),
        planlananIlce: ilOnBilgi.taranacakIlceSayisi,
      });
      ilModuKapat();
    } catch {
      setOnayHata("Tarama baslatilamadi (ag hatasi).");
      setIlModu("onay");
    }
  }, [secilenPlaka, ilOnBilgi, tarama, ilModuKapat]);

  // Escape ile moddan cik.
  useEffect(() => {
    if (ilModu === "kapali") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ilModuKapat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ilModu, ilModuKapat]);

  // Tarama bitince: katmanı aç + modül cache'ini geçersiz kıl.
  // setTimeout(…, 0): React Compiler effect içinde senkron setState'i
  // cascading render riski diye reddediyor (useRaporCekme.tsx:229-238 ile
  // aynı çözüm). Bir tik gecikmenin görünür etkisi yok.
  const taramaAsamasi = tarama.run?.asama ?? null;
  useEffect(() => {
    if (taramaAsamasi !== "bitti") return;
    const id = window.setTimeout(() => {
      setShowPotansiyel(true);
      refreshPotansiyel();
    }, 0);
    return () => window.clearTimeout(id);
  }, [taramaAsamasi, refreshPotansiyel]);

  const [highlightedRutKod, setHighlightedRutKod] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Değer artık UI'da okunmuyor (AI paneli kaldırıldı) — setter'lar yükleme
  // akışının yan etkileri (harita vurgusu, filtre sıfırlama) için hâlâ gerekli.
  const [, setImportActivity] = useState<ImportStage | null>(null);
  const [, setLastUploadResult] = useState<UploadResult | null>(null);
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
      overlayAction: {
        pressed: importOpen,
        onClick: handleToggleImport,
        label: "Veri yükle",
      },
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
      importOpen,
      handleToggleImport,
    ]
  );

  const showLegend = !(
    isMobileLayout &&
    (selectedMusteri || selectedPotansiyel)
  );
  const showBlockingLoader = loading && rows.length === 0;

  return (
    <>
      <div ref={mapAreaRef} className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden">
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
          ilSecimAktif={ilModu !== "kapali"}
          ilSecili={secilenPlaka}
          ilBoundsFocus={ilBoundsFocus}
          onIlSec={handleIlSec}
          onSelectMusteri={handleSelectMusteri}
          onSelectPotansiyel={handleSelectPotansiyel}
          canliAraclar={canliAraclar}
        />

        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 bg-transparent p-2 sm:gap-3 sm:p-3 md:p-4"
          style={MAP_OVERLAY_SAFE_PAD}
        >
          {/*
            Canlı araçlar kartı AKIŞIN DIŞINDA, sağ üstte.
            Önce aşağıdaki flex satırının içindeydi ve "Son sync" rozetini
            yerinden ediyordu (rozet aramanın yanında durmalı).

            Sarmalayıcı overlay'in PADDING'İNİ TEKRARLIYOR: `absolute top-0`
            padding'i atlayıp kartı arama çubuğundan yukarı kaçırıyordu, bu
            yüzden aynı `p-*` ve aynı safe-area değeri burada da veriliyor —
            kartın üst kenarı arama çubuğuyla aynı hizaya oturuyor.

            mr-10: Mapbox'ın zoom/pusula kontrolleri sağ kenarda, kart onların
            üstüne binmesin.
          */}
          {canliAraclar.length > 0 ? (
            <div
              className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-2 sm:p-3 md:p-4"
              style={MAP_OVERLAY_SAFE_PAD}
            >
              <div className="pointer-events-auto mr-10 w-[min(100%-3rem,19rem)] overflow-hidden rounded-2xl border border-border/45 bg-popover/66 text-popover-foreground shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] backdrop-blur-[24px] backdrop-saturate-150">
                <CanliAracKarti
                  konumlar={canliAraclar}
                  yukleniyor={canliYukleniyor}
                  odakliNode={odakliCanliNode}
                  varsayilanAcik={false}
                  onOdaklan={(k) => {
                    setOdakliCanliNode(k.node);
                    /*
                     * Mevcut `regionFocus` makinesi yeniden kullanılıyor:
                     * aracın çevresinde ~400 m'lik küçük bir kutu verilince
                     * harita oraya fitBounds yapıp yakınlaşıyor.
                     */
                    const d = 0.004;
                    setRegionFocus({
                      bounds: [
                        [k.lon - d, k.lat - d],
                        [k.lon + d, k.lat + d],
                      ],
                      nonce: Date.now(),
                    });
                  }}
                />
              </div>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-wrap items-start gap-2 overflow-x-visible overflow-y-auto">
            <div className="pointer-events-auto min-h-0 min-w-0 w-full lg:max-w-[22.5rem]">
              <FilterPanel
                {...filterProps}
                variant="overlay"
                overlayLeading={<AppSidebarMobileTrigger embedded />}
              />
              <AnimatePresence>
                {importOpen && (
                  <div className="mt-2">
                    <DataImportFlow
                      onClose={handleCloseImport}
                      onComplete={refresh}
                      onStageChange={setImportActivity}
                      onResult={handleUploadResult}
                    />
                  </div>
                )}
              </AnimatePresence>
            </div>
            {refreshing && (
              <span className="pointer-events-none mt-1.5 rounded-full border bg-popover/90 px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase shadow-md">
                Yenileniyor…
              </span>
            )}
            {!refreshing && syncLabel ? (
              <span
                className={`pointer-events-none mt-1.5 max-w-[14rem] truncate rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide shadow-md sm:max-w-none ${
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

          <div className="mb-[max(2.25rem,env(safe-area-inset-bottom))] flex shrink-0 items-end justify-between gap-2 sm:mb-8">
            <div className="flex items-end gap-2">
              <MapLayersControl
                riskMode={riskMode}
                onRiskModeChange={handleRiskModeChange}
                tipFilter={tipFilter}
                onTipFilterChange={handleTipFilterChange}
                potansiyelActive={showPotansiyel}
                onPotansiyelChange={handleShowPotansiyelChange}
                potansiyelCount={showPotansiyel ? potansiyelRows.length : null}
                potansiyelLoading={showPotansiyel && potansiyelLoading}
              />
              <PotansiyelAraLauncher
                aktif={ilModu !== "kapali"}
                kalanKota={tarama.kota?.kalan ?? null}
                taramaCalisiyor={tarama.calisiyor}
                onToggle={handleIlModuToggle}
              />
            </div>
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

        {ilModu !== "kapali" && (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between"
            style={MAP_OVERLAY_SAFE_PAD}
          >
            <IlSecimBari
              className="mt-2"
              yukleniyor={ilModu === "yukleniyor"}
              kota={tarama.kota}
              onKapat={ilModuKapat}
            />
            {(ilModu === "onay" || ilModu === "gonderiliyor") && (
              <TaramaOnayKarti
                className="mb-[max(2.25rem,env(safe-area-inset-bottom))] sm:mb-10"
                onBilgi={ilOnBilgi}
                kota={tarama.kota}
                gonderiliyor={ilModu === "gonderiliyor"}
                hata={onayHata}
                onBaslat={() => void handleTaramaBaslat()}
                onVazgec={ilModuKapat}
              />
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0">
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
                <Typography.Heading level={6} className="text-destructive">
                  Veri yüklenemedi
                </Typography.Heading>
                <Typography.Paragraph size="xs" color="muted" className="mt-1">
                  {error}
                </Typography.Paragraph>
                <Typography.Paragraph size="xs" color="muted" className="mt-2">
                  <Typography.Code>frontend/.env.local</Typography.Code>{" "}
                  dosyasındaki Supabase değerlerini kontrol edin.
                </Typography.Paragraph>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
