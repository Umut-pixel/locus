"use client";

import { memo, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Typography } from "@heroui/react";

import { THEME_STORAGE_KEY, useTheme } from "@/components/theme/ThemeProvider";
import { DEPOT } from "@/lib/depot";
import { DEFAULT_MAP_VIEW, MAPBOX_STYLE_URL, MAPBOX_TOKEN, MAP_OVERLAY_SLOT } from "@/lib/mapbox-style";
import { SHIPMENT_OPERATIONS_LIGHT_STYLE } from "@/lib/mapbox-style-light";
import { clusterConfigForZoom, type ClusterConfig } from "@/lib/map-clusters";
import {
  CLUSTER_COUNT_LAYER,
  CLUSTER_LAYER,
  POINT_HIT_LAYER,
  POINT_LAYER,
  SELECTED_LAYER,
  SOURCE_ID,
  UPDATED_RING_LAYER,
  addCustomerLayers,
  applyClusterDimPaint,
  recreateCustomerSource,
} from "@/lib/map-customer-layers";
import { snapSegmentsToRoads } from "@/lib/mapbox-directions";
import {
  buildRouteLineCollection,
  buildRouteWaypointSegments,
  selectRouteComponent,
  sortRouteFeatures,
} from "@/lib/route-line";
import {
  revealRouteLine,
  type RouteRevealTween,
} from "@/lib/route-reveal";
import type { MusteriFeatureCollection } from "@/lib/geojson";
import {
  POTANSIYEL_CLUSTER_LAYER,
  POTANSIYEL_POINT_HIT_LAYER,
  POTANSIYEL_POINT_LAYER,
  POTANSIYEL_SELECTED_LAYER,
  POTANSIYEL_SOURCE_ID,
  addPotansiyelLayers,
  recreatePotansiyelSource,
  setPotansiyelData,
  setPotansiyelSelectedId,
  setPotansiyelVisibility,
} from "@/lib/map-potansiyel-layers";
import type { PotansiyelFeatureCollection } from "@/lib/potansiyel-geojson";
import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import { TIP_LABELS, TIP_STROKE_COLORS } from "@/lib/tip-style";
import type { MusteriHarita, PotansiyelHarita } from "@/lib/types";
import {
  GEOLOCATE_FIT_OPTIONS,
  initialMapViewFromUserLocation,
  writeLastUserLocation,
} from "@/lib/user-location";

const ROUTE_SOURCE_ID = "route-points";
const ROUTE_LINE_SOURCE_ID = "route-line";
const ROUTE_LAYER = "route-highlight";
const ROUTE_GLOW_LAYER = "route-highlight-glow";
const ROUTE_LINE_LAYER = "route-line";
const ROUTE_LINE_CASING_LAYER = "route-line-casing";
const ROUTE_ORDER_LAYER = "route-order-labels";
/** Google Maps directions mavi */
const ROUTE_HIGHLIGHT_COLOR = "#4285F4";
const ROUTE_LINE_COLOR = "#4285F4";
const ROUTE_LINE_CASING_COLOR = "#7667F8";
const EMPTY_FEATURE_COLLECTION: MusteriFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const EMPTY_LINE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY_POTANSIYEL_COLLECTION: PotansiyelFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface PetshopMapProps {
  data: MusteriFeatureCollection;
  selectedMusteriKodu: string | null;
  highlightedRutKod: string | null;
  /** Sidebar aramadan seçim — easeTo + kart açılışı */
  focusTarget?: {
    musteri_kodu: string;
    lat: number;
    lon: number;
    nonce: number;
  } | null;
  /** Şehir filtresi — fitBounds ile bölgeye git (kart açılmaz). */
  regionFocus?: {
    bounds: [[number, number], [number, number]];
    nonce: number;
  } | null;
  /** Favori listesinden seçim — potansiyel katmanını açıp focus */
  potansiyelFocusTarget?: {
    id: string;
    lat: number;
    lon: number;
    nonce: number;
  } | null;
  potansiyelData?: PotansiyelFeatureCollection;
  potansiyelVisible?: boolean;
  selectedPotansiyelId?: string | null;
  /**
   * Petshop + veteriner ikisi de açıkken renkli tip halkası.
   * Tek kanal filtresinde halka gizlenir.
   */
  showTipRing?: boolean;
  onSelectMusteri: (
    musteri: MusteriHarita | null,
    screenPoint?: { x: number; y: number }
  ) => void;
  onSelectPotansiyel?: (
    potansiyel: PotansiyelHarita | null,
    screenPoint?: { x: number; y: number }
  ) => void;
}

export const PetshopMap = memo(function PetshopMap({
  data,
  selectedMusteriKodu,
  highlightedRutKod,
  focusTarget = null,
  regionFocus = null,
  potansiyelFocusTarget = null,
  potansiyelData = EMPTY_POTANSIYEL_COLLECTION,
  potansiyelVisible = false,
  selectedPotansiyelId = null,
  onSelectMusteri,
  onSelectPotansiyel,
}: PetshopMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const dataRef = useRef(data);
  const potansiyelDataRef = useRef(potansiyelData);
  const potansiyelVisibleRef = useRef(potansiyelVisible);
  const hoveredIdRef = useRef<string | number | undefined>(undefined);
  const closeTimerRef = useRef(0);
  const lastHoveredPropsRef = useRef<MusteriHarita | null>(null);
  const onSelectRef = useRef(onSelectMusteri);
  const onSelectPotansiyelRef = useRef(onSelectPotansiyel);
  const routeTweenRef = useRef<RouteRevealTween | null>(null);
  const dataSignatureRef = useRef<string>("");
  const clusterConfigRef = useRef<ClusterConfig | null>(null);
  const clustersDimmedRef = useRef(false);
  const selectedKodRef = useRef<string | null>(null);
  const selectedPotansiyelIdRef = useRef<string | null>(null);
  const clusterZoomTimerRef = useRef(0);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const depotMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const mountOverlaysRef = useRef<(() => void) | null>(null);
  /** setStyle() sonrası hangi basemap yüklü — gereksiz tekrar swap'ı önler. */
  const currentMapThemeRef = useRef<"light" | "dark" | null>(null);
  /**
   * ThemeProvider ilk mount'ta her zaman "light" ile başlar (SSR-safe),
   * gerçek DOM class'ını bir tık sonra effect'te senkronlar. Bu yüzden bu
   * effect'in İLK çalışması context'ten gelen bayat değeri taşıyabilir —
   * atlanır; kurulum effect'i DOM'dan doğrudan okuyup zaten doğru stille
   * başlatmıştı.
   */
  const skipFirstThemeSyncRef = useRef(true);
  const { theme } = useTheme();

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    potansiyelDataRef.current = potansiyelData;
  }, [potansiyelData]);

  useEffect(() => {
    potansiyelVisibleRef.current = potansiyelVisible;
  }, [potansiyelVisible]);


  useEffect(() => {
    onSelectRef.current = onSelectMusteri;
  }, [onSelectMusteri]);

  useEffect(() => {
    onSelectPotansiyelRef.current = onSelectPotansiyel;
  }, [onSelectPotansiyel]);

  useEffect(() => {
    selectedKodRef.current = selectedMusteriKodu;
  }, [selectedMusteriKodu]);

  useEffect(() => {
    selectedPotansiyelIdRef.current = selectedPotansiyelId;
  }, [selectedPotansiyelId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !focusTarget) return;

    const { lat, lon, musteri_kodu } = focusTarget;
    const targetZoom = Math.max(map.getZoom(), 14);
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      const screen = map.project([lon, lat]);
      const feat = dataRef.current.features.find(
        (f) => f.properties.musteri_kodu === musteri_kodu
      );
      const props = (feat?.properties ?? {
        musteri_kodu,
        lat,
        lon,
      }) as MusteriHarita;
      onSelectRef.current(props, { x: screen.x, y: screen.y });
    };

    map.easeTo({
      center: [lon, lat],
      zoom: targetZoom,
      duration: 700,
      essential: true,
    });
    const timer = window.setTimeout(finish, 720);

    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, [focusTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !regionFocus) return;

    map.fitBounds(regionFocus.bounds, {
      padding: { top: 72, bottom: 72, left: 56, right: 56 },
      maxZoom: 11.5,
      duration: 900,
      essential: true,
    });
  }, [regionFocus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !potansiyelFocusTarget) return;

    const { lat, lon, id } = potansiyelFocusTarget;
    const targetZoom = Math.max(map.getZoom(), 14);
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      const screen = map.project([lon, lat]);
      const feat = potansiyelDataRef.current.features.find(
        (f) => f.properties.id === id
      );
      const props = (feat?.properties ?? {
        id,
        lat,
        lon,
        kaynak_id: null,
        isim: null,
        adres: null,
        ilce: null,
        il: null,
        primary_type: null,
        google_types: null,
        kalite_bayragi: null,
        tarandigi_tarih: null,
      }) as PotansiyelHarita;
      onSelectPotansiyelRef.current?.(props, { x: screen.x, y: screen.y });
    };

    map.easeTo({
      center: [lon, lat],
      zoom: targetZoom,
      duration: 700,
      essential: true,
    });
    const timer = window.setTimeout(finish, 720);

    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, [potansiyelFocusTarget]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const startView = initialMapViewFromUserLocation(DEFAULT_MAP_VIEW);
    // Context henüz "light" varsayılanından senkronlanmamış olabilir, DOM class'ı
    // da hydration'ın server (temasız) değerine geri aldığı an olabilir —
    // ikisi de güvenilmez; doğrudan localStorage'a (aynı kaynak ThemeProvider'ın
    // kullandığı) bak.
    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // localStorage erişilemez — light varsayılan kalır.
    }
    const initialIsDark = storedTheme === "dark";
    currentMapThemeRef.current = initialIsDark ? "dark" : "light";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: initialIsDark ? MAPBOX_STYLE_URL : SHIPMENT_OPERATIONS_LIGHT_STYLE,
      center: startView.center,
      zoom: startView.zoom,
      attributionControl: true,
      // Dokunmatikte nokta seçimini kolaylaştır
      clickTolerance: 10,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      fitBoundsOptions: { ...GEOLOCATE_FIT_OPTIONS },
      trackUserLocation: true,
      showUserHeading: true,
      showAccuracyCircle: true,
    });
    map.addControl(geolocate, "top-right");

    geolocate.on("geolocate", (e) => {
      writeLastUserLocation(e.coords.longitude, e.coords.latitude);
    });

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "petshop-popup",
    });
    popupRef.current = popup;

    depotMarkerRef.current?.remove();
    depotMarkerRef.current = createDepotMarker().addTo(map);

    const mountOverlays = () => {
      const initialCfg = clusterConfigForZoom(map.getZoom());
      clusterConfigRef.current = initialCfg;

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: dataRef.current,
          cluster: true,
          clusterMaxZoom: initialCfg.maxZoom,
          clusterRadius: initialCfg.radius,
          promoteId: "musteri_kodu",
        });
      }

      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: EMPTY_FEATURE_COLLECTION,
        });
      }
      if (!map.getSource(ROUTE_LINE_SOURCE_ID)) {
        map.addSource(ROUTE_LINE_SOURCE_ID, {
          type: "geojson",
          data: EMPTY_LINE_COLLECTION,
        });
      }

      if (!map.getLayer(CLUSTER_LAYER)) {
        addCustomerLayers(map, clustersDimmedRef.current, undefined);
      }

      // Prospect katmanı — müşterilerden sonra, rota katmanlarından önce
      addPotansiyelLayers(map, initialCfg, {
        visible: potansiyelVisibleRef.current,
      });
      setPotansiyelData(map, potansiyelDataRef.current);
      setPotansiyelSelectedId(map, selectedPotansiyelIdRef.current);

      if (!map.getLayer(ROUTE_LINE_CASING_LAYER)) {
        map.addLayer({
          id: ROUTE_LINE_CASING_LAYER,
          type: "line",
          slot: MAP_OVERLAY_SLOT,
          source: ROUTE_LINE_SOURCE_ID,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": ROUTE_LINE_CASING_COLOR,
            "line-width": 8,
            "line-opacity": 0.85,
          },
        });
      }
      if (!map.getLayer(ROUTE_LINE_LAYER)) {
        map.addLayer({
          id: ROUTE_LINE_LAYER,
          type: "line",
          slot: MAP_OVERLAY_SLOT,
          source: ROUTE_LINE_SOURCE_ID,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": ROUTE_LINE_COLOR,
            "line-width": 5,
            "line-opacity": 1,
          },
        });
      }

      if (!map.getLayer(ROUTE_GLOW_LAYER)) {
        map.addLayer({
          id: ROUTE_GLOW_LAYER,
          type: "circle",
          slot: MAP_OVERLAY_SLOT,
          source: ROUTE_SOURCE_ID,
          paint: {
            "circle-radius": 16,
            "circle-color": ROUTE_HIGHLIGHT_COLOR,
            "circle-opacity": 0.22,
            "circle-blur": 0.85,
          },
        });
      }

      if (!map.getLayer(ROUTE_LAYER)) {
        map.addLayer({
          id: ROUTE_LAYER,
          type: "circle",
          slot: MAP_OVERLAY_SLOT,
          source: ROUTE_SOURCE_ID,
          paint: {
            "circle-radius": 11,
            "circle-color": "#ffffff",
            "circle-stroke-width": 3,
            "circle-stroke-color": ROUTE_HIGHLIGHT_COLOR,
            "circle-stroke-opacity": 1,
          },
        });
      }

      if (!map.getLayer(ROUTE_ORDER_LAYER)) {
        map.addLayer({
          id: ROUTE_ORDER_LAYER,
          type: "symbol",
          slot: MAP_OVERLAY_SLOT,
          source: ROUTE_SOURCE_ID,
          filter: ["has", "ziyaret_sira"],
          minzoom: 8,
          layout: {
            "text-field": ["to-string", ["get", "ziyaret_sira"]],
            "text-size": 11,
            "text-font": ["Arial Unicode MS Bold"],
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-offset": [0, -1.6],
          },
          paint: {
            "text-color": ROUTE_HIGHLIGHT_COLOR,
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.25,
          },
        });
      } else {
        // HMR / yeniden mount: stil sabitleri güncellensin
        map.setPaintProperty(ROUTE_LINE_CASING_LAYER, "line-color", ROUTE_LINE_CASING_COLOR);
        map.setPaintProperty(ROUTE_LINE_CASING_LAYER, "line-width", 8);
        map.setPaintProperty(ROUTE_LINE_CASING_LAYER, "line-opacity", 0.85);
        map.setPaintProperty(ROUTE_LINE_LAYER, "line-color", ROUTE_LINE_COLOR);
        map.setPaintProperty(ROUTE_LINE_LAYER, "line-width", 5);
        map.setPaintProperty(ROUTE_LINE_LAYER, "line-opacity", 1);
        map.setPaintProperty(ROUTE_GLOW_LAYER, "circle-color", ROUTE_HIGHLIGHT_COLOR);
        map.setPaintProperty(ROUTE_LAYER, "circle-stroke-color", ROUTE_HIGHLIGHT_COLOR);
        map.setPaintProperty(ROUTE_LAYER, "circle-color", "#ffffff");
        map.setPaintProperty(ROUTE_ORDER_LAYER, "text-color", ROUTE_HIGHLIGHT_COLOR);
        map.setPaintProperty(ROUTE_ORDER_LAYER, "text-halo-color", "#ffffff");
      }

      if (map.getLayer(SELECTED_LAYER)) {
        map.setFilter(SELECTED_LAYER, [
          "==",
          ["get", "musteri_kodu"],
          selectedKodRef.current ?? "__none__",
        ]);
      }

      const musterilerSource = map.getSource(SOURCE_ID) as
        | mapboxgl.GeoJSONSource
        | undefined;
      musterilerSource?.setData(dataRef.current);

      loadedRef.current = true;
      dataSignatureRef.current = "";
    };
    mountOverlaysRef.current = mountOverlays;

    map.on("load", () => {
      mountOverlays();
      // İzin bir kez verildiyse tarayıcı tekrar sormaz; her girişte nokta + merkez.
      requestAnimationFrame(() => {
        try {
          geolocate.trigger();
        } catch {
          // Geolocation API yok / insecure context
        }
      });
    });

    const coarsePointer = window.matchMedia("(hover: none)").matches;

    /** Hover state + popup'u temizler, gecikme ile. */
    const scheduleClose = (delay: number) => {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        if (hoveredIdRef.current !== undefined) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false }
          );
          hoveredIdRef.current = undefined;
        }
        popup.remove();
      }, delay);
    };

    /** Popup DOM hazır olunca bir kez hover listener ekler. */
    let popupListenersAttached = false;
    const attachPopupListeners = () => {
      if (popupListenersAttached) return;
      const popupEl = popup.getElement();
      if (!popupEl) return;
      popupEl.addEventListener("mouseenter", () =>
        window.clearTimeout(closeTimerRef.current)
      );
      popupEl.addEventListener("mouseleave", () => scheduleClose(320));
      popupListenersAttached = true;
    };

    map.on("mousemove", POINT_HIT_LAYER, (e) => {
      // Dokunmatikte hover gereksiz maliyeti önle.
      if (coarsePointer) return;
      // Bekleyen kapanma timer'ını iptal et (pin→popup geçişinde kapanma yok).
      window.clearTimeout(closeTimerRef.current);
      map.getCanvas().style.cursor = "pointer";

      const feature = e.features?.[0];
      const newId = feature?.id as string | number | undefined;

      // Feature state hover tracking
      if (hoveredIdRef.current !== newId) {
        if (hoveredIdRef.current !== undefined) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false }
          );
        }
        hoveredIdRef.current = newId;
        if (newId !== undefined) {
          map.setFeatureState(
            { source: SOURCE_ID, id: newId },
            { hover: true }
          );
        }
      }

      if (!feature || feature.geometry.type !== "Point") return;
      const props = feature.properties as MusteriHarita;
      lastHoveredPropsRef.current = props;
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      popup.setLngLat([lon, lat]).setHTML(buildMusteriPopupHTML(props)).addTo(map);
      attachPopupListeners();
    });

    map.on("mouseleave", POINT_HIT_LAYER, () => {
      map.getCanvas().style.cursor = "";
      // 220 ms gecikme: kullanıcı popup'a geçiyorsa kapanmayı önler.
      scheduleClose(220);
    });

    // Popup içindeki butonlar için event delegation
    const container = containerRef.current;
    const onContainerClick = (ev: MouseEvent) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>(
        "[data-locus-action]"
      );
      if (!btn) return;
      ev.stopPropagation();
      const action = btn.getAttribute("data-locus-action");
      const props = lastHoveredPropsRef.current;
      if (!props) return;
      window.clearTimeout(closeTimerRef.current);
      if (hoveredIdRef.current !== undefined) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false }
        );
        hoveredIdRef.current = undefined;
      }
      popup.remove();
      if (action === "select") {
        onSelectRef.current(props, undefined);
      }
      // "route": gelecekte highlightedRutKod bağlanabilir — şimdi detay açar.
      if (action === "route") {
        onSelectRef.current(props, undefined);
      }
    };
    container?.addEventListener("click", onContainerClick);

    const syncClustersToZoom = () => {
      const cfg = clusterConfigForZoom(map.getZoom());
      const prev = clusterConfigRef.current;
      if (prev && prev.band === cfg.band) return;
      clusterConfigRef.current = cfg;
      const potansiyelBefore = map.getLayer(POTANSIYEL_POINT_LAYER)
        ? POTANSIYEL_POINT_LAYER
        : ROUTE_LINE_CASING_LAYER;
      recreateCustomerSource(map, dataRef.current, cfg, {
        dimmed: clustersDimmedRef.current,
        selectedKod: selectedKodRef.current,
        beforeLayerId: potansiyelBefore,
      });
      if (map.getSource(POTANSIYEL_SOURCE_ID)) {
        recreatePotansiyelSource(map, potansiyelDataRef.current, cfg, {
          visible: potansiyelVisibleRef.current,
          selectedId: selectedPotansiyelIdRef.current,
          beforeLayerId: ROUTE_LINE_CASING_LAYER,
        });
      }
    };
    map.on("zoomend", () => {
      window.clearTimeout(clusterZoomTimerRef.current);
      clusterZoomTimerRef.current = window.setTimeout(syncClustersToZoom, 120);
    });

    map.on("click", POINT_HIT_LAYER, (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      e.originalEvent.stopPropagation();
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const screen = map.project([lon, lat]);
      onSelectPotansiyelRef.current?.(null);
      onSelectRef.current(feature.properties as MusteriHarita, {
        x: screen.x,
        y: screen.y,
      });
    });

    map.on("mouseenter", POTANSIYEL_POINT_HIT_LAYER, () => {
      if (potansiyelVisibleRef.current) {
        map.getCanvas().style.cursor = "pointer";
      }
    });
    map.on("mouseleave", POTANSIYEL_POINT_HIT_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", POTANSIYEL_POINT_HIT_LAYER, (e) => {
      if (!potansiyelVisibleRef.current) return;
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      e.originalEvent.stopPropagation();
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const screen = map.project([lon, lat]);
      const props = feature.properties as PotansiyelHarita;
      onSelectRef.current(null);
      onSelectPotansiyelRef.current?.(
        {
          ...props,
          id: String(props.id),
          lat: Number(props.lat ?? lat),
          lon: Number(props.lon ?? lon),
        },
        { x: screen.x, y: screen.y }
      );
    });

    map.on("mouseenter", POTANSIYEL_CLUSTER_LAYER, () => {
      if (potansiyelVisibleRef.current) {
        map.getCanvas().style.cursor = "pointer";
      }
    });
    map.on("mouseleave", POTANSIYEL_CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", POTANSIYEL_CLUSTER_LAYER, (e) => {
      if (!potansiyelVisibleRef.current) return;
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      e.originalEvent.stopPropagation();
      const clusterId = feature.properties?.cluster_id;
      const coordinates = feature.geometry.coordinates as [number, number];
      const source = map.getSource(POTANSIYEL_SOURCE_ID) as mapboxgl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        map.easeTo({
          center: coordinates,
          zoom,
          duration: 400,
        });
      });
    });

    map.on("mouseenter", CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", CLUSTER_LAYER, (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const clusterId = feature.properties?.cluster_id;
      const coordinates = feature.geometry.coordinates as [number, number];
      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        map.easeTo({
          center: coordinates,
          zoom,
          duration: 400,
        });
      });
    });

    // Pin/cluster dışı boş harita tıklanınca açık kartı kapat.
    map.on("click", (e) => {
      const layers = [
        POINT_HIT_LAYER,
        POINT_LAYER,
        CLUSTER_LAYER,
        POTANSIYEL_POINT_HIT_LAYER,
        POTANSIYEL_POINT_LAYER,
        POTANSIYEL_CLUSTER_LAYER,
      ].filter((id) => Boolean(map.getLayer(id)));
      if (layers.length === 0) {
        onSelectRef.current(null);
        onSelectPotansiyelRef.current?.(null);
        return;
      }
      const hit = map.queryRenderedFeatures(e.point, { layers });
      if (hit.length === 0) {
        onSelectRef.current(null);
        onSelectPotansiyelRef.current?.(null);
      }
    });

    return () => {
      window.clearTimeout(clusterZoomTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
      container?.removeEventListener("click", onContainerClick);
      loadedRef.current = false;
      depotMarkerRef.current?.remove();
      depotMarkerRef.current = null;
      popup.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sidebar'daki tema toggle'ı — basemap'i light/dark Studio stili arasında değiştirir.
  useEffect(() => {
    if (skipFirstThemeSyncRef.current) {
      skipFirstThemeSyncRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (currentMapThemeRef.current === theme) return;
    currentMapThemeRef.current = theme;
    map.setStyle(theme === "dark" ? MAPBOX_STYLE_URL : SHIPMENT_OPERATIONS_LIGHT_STYLE);
    map.once("style.load", () => {
      mountOverlaysRef.current?.();
    });
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    // Aynı veri setini tekrar setData etme (gereksiz re-cluster).
    // Kod + risk + güncelleme bayrağı değişince imza değişir.
    let fingerprint = data.features.length;
    let updatedCount = 0;
    for (const f of data.features) {
      const p = f.properties;
      if (p.son_yuklemede_guncellendi) updatedCount += 1;
      fingerprint =
        (Math.imul(fingerprint, 31) +
          (p.toplam_teslimat_sayisi | 0) +
          (p.risk_durumu?.charCodeAt(0) ?? 0) * 17 +
          (p.son_yuklemede_guncellendi ? 1 : 0) * 101) |
        0;
    }
    const sig = `${data.features.length}:${updatedCount}:${fingerprint}:${data.features[0]?.properties.musteri_kodu ?? ""}:${data.features[data.features.length - 1]?.properties.musteri_kodu ?? ""}`;
    if (sig === dataSignatureRef.current) return;
    dataSignatureRef.current = sig;
    source.setData(data);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer(SELECTED_LAYER)) return;
    map.setFilter(SELECTED_LAYER, [
      "==",
      ["get", "musteri_kodu"],
      selectedMusteriKodu ?? "__none__",
    ]);
  }, [selectedMusteriKodu]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setPotansiyelData(map, potansiyelData);
  }, [potansiyelData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setPotansiyelVisibility(map, potansiyelVisible);
  }, [potansiyelVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setPotansiyelSelectedId(map, selectedPotansiyelId);
  }, [selectedPotansiyelId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const routeSource = map.getSource(ROUTE_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
    const lineSource = map.getSource(ROUTE_LINE_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!routeSource || !lineSource) return;

    const setBackgroundDim = (
      active: boolean,
      visibleMusteriKodlari?: string[]
    ) => {
      clustersDimmedRef.current = active;
      applyClusterDimPaint(map, active);

      const baseUnclustered: mapboxgl.ExpressionSpecification = [
        "!",
        ["has", "point_count"],
      ];
      let pointFilter: mapboxgl.FilterSpecification = baseUnclustered;
      if (active && visibleMusteriKodlari && visibleMusteriKodlari.length > 0) {
        pointFilter = [
          "all",
          baseUnclustered,
          ["in", ["get", "musteri_kodu"], ["literal", visibleMusteriKodlari]],
        ];
      } else if (active) {
        pointFilter = [
          "all",
          baseUnclustered,
          ["==", ["to-string", ["get", "rut_kod"]], String(highlightedRutKod)],
        ];
      }

      if (map.getLayer(POINT_LAYER)) {
        map.setFilter(POINT_LAYER, pointFilter);
      }
      if (map.getLayer(POINT_HIT_LAYER)) {
        map.setFilter(POINT_HIT_LAYER, pointFilter);
      }
      if (map.getLayer(UPDATED_RING_LAYER)) {
        map.setFilter(UPDATED_RING_LAYER, [
          "all",
          pointFilter,
          ["==", ["get", "son_yuklemede_guncellendi"], 1],
        ]);
      }
    };

    const killRouteTween = () => {
      routeTweenRef.current?.kill();
      routeTweenRef.current = null;
    };

    if (!highlightedRutKod) {
      killRouteTween();
      routeSource.setData(EMPTY_FEATURE_COLLECTION);
      lineSource.setData(EMPTY_LINE_COLLECTION);
      setBackgroundDim(false);
      return;
    }

    // dataRef: filtre/geojson değişince Directions+GSAP yeniden başlamasın.
    const matching = dataRef.current.features.filter(
      (feature) => String(feature.properties.rut_kod) === String(highlightedRutKod)
    );
    const sorted = sortRouteFeatures(matching);
    // ERP aynı rut_kod altında coğrafi olarak kopuk duraklar taşıyabiliyor
    // (ör. 509: İzmir + Muğla). Yalnızca seçili müşterinin hop-bağlı
    // bileşenini çiz — iki ayrı "rota" hissi oluşmasın.
    const component = selectRouteComponent(sorted, {
      selectedMusteriKodu,
    });
    const routeOpts = {
      selectedMusteriKodu,
      depot: DEPOT.lngLat,
    };
    const segments = buildRouteWaypointSegments(sorted, routeOpts);
    const straight = buildRouteLineCollection(sorted, routeOpts);
    const componentKodlari = component.map((f) => f.properties.musteri_kodu);

    routeSource.setData({ type: "FeatureCollection", features: component });
    setBackgroundDim(true, componentKodlari);

    const zoomCoords = component.map(
      (f) => f.geometry.coordinates as [number, number]
    );
    if (zoomCoords.length > 0 || segments.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(DEPOT.lngLat);
      for (const c of zoomCoords) bounds.extend(c);
      const w = map.getContainer().clientWidth;
      const h = map.getContainer().clientHeight;
      const pad = w < 640
        ? { top: 56, bottom: Math.min(280, Math.round(h * 0.42)), left: 24, right: 24 }
        : 80;
      map.fitBounds(bounds, {
        padding: pad,
        maxZoom: zoomCoords.length <= 2 ? 12 : 11,
        duration: 600,
      });
    }

    const ac = new AbortController();
    let cancelled = false;
    let paintGen = 0;

    const paintRoute = (
      fc: GeoJSON.FeatureCollection,
      opts?: { animate?: boolean }
    ) => {
      if (cancelled || !mapRef.current) return;
      const gen = ++paintGen;
      killRouteTween();

      if (!opts?.animate || fc.features.length === 0) {
        lineSource.setData(fc);
        return;
      }

      void revealRouteLine(
        fc,
        (partial) => {
          if (cancelled || gen !== paintGen || !mapRef.current) return;
          lineSource.setData(partial);
        },
        { duration: 1.1, signal: ac.signal }
      ).then((tween) => {
        if (cancelled || gen !== paintGen) {
          tween?.kill();
          return;
        }
        routeTweenRef.current = tween;
      });
    };

    // Anında kuş uçuşu çizgi — Directions beklerken boş ekran kalmasın.
    if (straight.features.length > 0) {
      paintRoute(straight, { animate: true });
    } else {
      lineSource.setData(EMPTY_LINE_COLLECTION);
    }

    if (segments.length === 0) {
      return () => {
        cancelled = true;
        killRouteTween();
        ac.abort();
      };
    }

    snapSegmentsToRoads(segments, ac.signal)
      .then((roadLines) => {
        if (cancelled || !mapRef.current) return;
        if (roadLines.features.length > 0) {
          // Yol oturtması geldiğinde animasyonsuz değiştir — çift çizim flash'ı yok.
          paintRoute(roadLines, { animate: false });
        }
      })
      .catch((err) => {
        if (cancelled || (err as Error).name === "AbortError") return;
        console.warn("[route] directions failed, keeping straight lines", err);
      });

    return () => {
      cancelled = true;
      killRouteTween();
      ac.abort();
    };
  }, [highlightedRutKod, selectedMusteriKodu]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground">
        <Typography.Paragraph size="sm">
          <Typography.Code>NEXT_PUBLIC_MAPBOX_TOKEN</Typography.Code> tanımlı
          değil. <br />
          <Typography.Code>frontend/.env.local</Typography.Code> dosyasına
          Mapbox public access token&apos;ınızı ekleyip sunucuyu yeniden
          başlatın.
        </Typography.Paragraph>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ── SVG icon strings (Lucide uyumlu, 12×12) ─────────────────────────────────
const ICON_PIN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const ICON_ROUTE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`;
const ICON_DEBT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`;

function fmtTutar(val: number): string {
  if (val >= 1_000_000) return `₺${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `₺${(val / 1_000).toFixed(1)}K`;
  return `₺${val.toFixed(0)}`;
}

function fmtKg(val: number): string {
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)} T`;
  return `${Math.round(val)} kg`;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "—";
  }
}

function debtStatus(props: MusteriHarita): { label: string; color: string } {
  if (props.borc_riskli === true || props.borc_riskli === ("true" as unknown)) {
    return { label: "Riskli (56+ hf)", color: RISK_COLORS.riskli };
  }
  const riskli = Number(props.yas_riskli_tutar ?? 0);
  if (riskli > 0) {
    return { label: "Borçlu", color: RISK_COLORS.izlenmeli };
  }
  return { label: "Temiz", color: RISK_COLORS.saglikli };
}

function buildMusteriPopupHTML(props: MusteriHarita): string {
  // ── Risk / kanal ──────────────────────────────────────────────────────────
  const risk = props.risk_durumu ?? "hic_teslimat_yok";
  const riskColor = RISK_COLORS[risk] ?? "#94a3b8";
  const riskLabel = RISK_SHORT_LABELS[risk] ?? risk;

  const tipKanal = props.tip_kanal ?? "diger";
  const chColor = TIP_STROKE_COLORS[tipKanal] ?? "#8A8A9A";
  const chLabel = TIP_LABELS[tipKanal] ?? "Diğer";

  // ── Lokasyon ─────────────────────────────────────────────────────────────
  const loc = [props.ilce, props.sehir].filter(Boolean).join(" / ");
  const adres = props.adres ?? loc;

  // ── Rut / ST ──────────────────────────────────────────────────────────────
  const rutKod = props.rut_kod ?? null;
  const rutAciklama = props.rut_aciklama ?? (rutKod ? `Rut ${rutKod}` : null);
  const stAdi = props.belge_st_adi ?? null;
  const routeText = stAdi ?? rutAciklama;

  // ── Borç ─────────────────────────────────────────────────────────────────
  const debt = debtStatus(props);

  // ── Metrikler ─────────────────────────────────────────────────────────────
  const sonTeslTarih = fmtDate(props.son_teslimat_tarihi);
  const ciro = fmtTutar(props.toplam_tutar ?? 0);
  const agirlik = fmtKg(props.toplam_agirlik ?? 0);
  const gecikmeGun = props.son_teslimattan_gecen_gun ?? null;
  const gecikmeStr = gecikmeGun !== null ? `${gecikmeGun} gün` : "—";

  return `<div class="lc-card">

  <div class="lc-head">
    <span class="lc-hdot" style="background:${riskColor};box-shadow:0 0 6px ${riskColor}"></span>
    <span class="lc-hname">${escapeHtml(props.unvan)}</span>
    <span class="lc-risk-badge" style="--rc:${riskColor}">${escapeHtml(riskLabel)}</span>
  </div>

  <div class="lc-sep"></div>

  <div class="lc-channel-row">
    <span class="lc-ch-pill" style="--ch:${chColor}">${escapeHtml(chLabel)}</span>
  </div>

  ${adres ? `<div class="lc-row">
    <span class="lc-ico">${ICON_PIN}</span>
    <span class="lc-rt">${escapeHtml(adres)}</span>
  </div>` : ""}

  ${routeText ? `<div class="lc-row">
    <span class="lc-ico">${ICON_ROUTE}</span>
    <span class="lc-rt">${escapeHtml(routeText)}</span>
    ${rutKod ? `<span class="lc-chip">${escapeHtml(rutKod)}</span>` : ""}
  </div>` : ""}

  <div class="lc-row">
    <span class="lc-ico">${ICON_DEBT}</span>
    <span class="lc-rt">Borç</span>
    <span class="lc-dbadge" style="--dc:${debt.color}">${escapeHtml(debt.label)}</span>
  </div>

  <div class="lc-sep lc-sep--gap"></div>

  <div class="lc-grid">
    <div class="lc-metric">
      <span class="lc-mlbl">Son Teslimat</span>
      <span class="lc-mval">${sonTeslTarih}</span>
    </div>
    <div class="lc-metric">
      <span class="lc-mlbl">Ciro</span>
      <span class="lc-mval">${ciro}</span>
    </div>
    <div class="lc-metric">
      <span class="lc-mlbl">Ağırlık</span>
      <span class="lc-mval">${agirlik}</span>
    </div>
    <div class="lc-metric">
      <span class="lc-mlbl">Gecikme</span>
      <span class="lc-mval ${gecikmeGun !== null && gecikmeGun > 90 ? "lc-mval--warn" : ""}">${gecikmeStr}</span>
    </div>
  </div>

  <div class="lc-actions">
    <button class="lc-btn lc-btn--primary" data-locus-action="select" data-kod="${escapeHtml(props.musteri_kodu)}">
      Detayı Gör
    </button>
    <button class="lc-btn lc-btn--ghost" data-locus-action="route" data-rut="${rutKod ? escapeHtml(rutKod) : ""}">
      Rotada Göster
    </button>
  </div>

</div>`;
}

function createDepotMarker(): mapboxgl.Marker {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", DEPOT.label);
  el.title = `${DEPOT.label} — ${DEPOT.address}`;
  el.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "gap:4px",
    "border:0",
    "background:transparent",
    "padding:0",
    "cursor:pointer",
    "filter:drop-shadow(0 2px 6px rgba(28,29,32,0.35))",
  ].join(";");

  el.innerHTML = `
    <span style="
      display:flex;align-items:center;justify-content:center;
      width:36px;height:36px;border-radius:10px;
      background:#1c1d20;border:2px solid #f4f4f5;
      color:#f4f4f5;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        <path d="M9 21v-7h6v7" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        <path d="M3.5 10.8h17" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
      </svg>
    </span>
    <span style="
      font-family:var(--font-geist-sans),system-ui,sans-serif;
      font-size:11px;font-weight:600;letter-spacing:0.02em;
      color:#1c1d20;background:#f4f4f5;padding:2px 7px;border-radius:999px;
      border:1px solid rgba(28,29,32,0.12);white-space:nowrap;
      line-height:1.3;
    ">Depo</span>
  `;

  const popup = new mapboxgl.Popup({
    offset: 18,
    closeButton: false,
    className: "petshop-popup",
  }).setHTML(
    `<div style="line-height:1.45;min-width:160px">
      <div style="font-family:var(--font-geist-sans),system-ui,sans-serif;font-size:12px;font-weight:600">${escapeHtml(DEPOT.label)}</div>
      <div style="font-family:var(--font-geist-sans),system-ui,sans-serif;font-size:11px;opacity:0.7;margin-top:4px">${escapeHtml(DEPOT.address)}</div>
    </div>`
  );

  return new mapboxgl.Marker({ element: el, anchor: "bottom" })
    .setLngLat(DEPOT.lngLat)
    .setPopup(popup);
}
