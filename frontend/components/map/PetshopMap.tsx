"use client";

import { memo, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { DEFAULT_MAP_VIEW, MAPBOX_STYLE_URL, MAPBOX_TOKEN } from "@/lib/mapbox-style";
import { clusterConfigForZoom, type ClusterConfig } from "@/lib/map-clusters";
import {
  CLUSTER_COUNT_LAYER,
  CLUSTER_LAYER,
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
import type { MusteriHarita, PotansiyelHarita } from "@/lib/types";

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
const ROUTE_LINE_CASING_COLOR = "#1A73E8";
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
  potansiyelData?: PotansiyelFeatureCollection;
  potansiyelVisible?: boolean;
  selectedPotansiyelId?: string | null;
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
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE_URL,
      center: DEFAULT_MAP_VIEW.center,
      zoom: DEFAULT_MAP_VIEW.zoom,
      attributionControl: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "petshop-popup",
    });
    popupRef.current = popup;

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
        addCustomerLayers(map, clustersDimmedRef.current);
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

    map.on("load", mountOverlays);

    const coarsePointer = window.matchMedia("(hover: none)").matches;

    map.on("mouseenter", POINT_LAYER, (e) => {
      // Dokunmatikte hover popup gereksiz maliyeti önle.
      if (coarsePointer) return;
      map.getCanvas().style.cursor = "pointer";
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const props = feature.properties as MusteriHarita;
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      popup
        .setLngLat([lon, lat])
        .setHTML(
          `<div style="line-height:1.45">
              <div style="font-family:var(--font-geist-sans),system-ui,sans-serif;font-size:12px;font-weight:500">${escapeHtml(props.unvan)}</div>
              <div style="font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.6;margin-top:3px">${escapeHtml(props.sehir ?? "")}${props.ilce ? " / " + escapeHtml(props.ilce) : ""}</div>
            </div>`
        )
        .addTo(map);
    });

    map.on("mouseleave", POINT_LAYER, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });

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

    map.on("click", POINT_LAYER, (e) => {
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

    map.on("mouseenter", POTANSIYEL_POINT_LAYER, () => {
      if (potansiyelVisibleRef.current) {
        map.getCanvas().style.cursor = "pointer";
      }
    });
    map.on("mouseleave", POTANSIYEL_POINT_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", POTANSIYEL_POINT_LAYER, (e) => {
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
        POINT_LAYER,
        CLUSTER_LAYER,
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
      loadedRef.current = false;
      popup.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    const routeOpts = { selectedMusteriKodu };
    const segments = buildRouteWaypointSegments(sorted, routeOpts);
    const straight = buildRouteLineCollection(sorted, routeOpts);
    const componentKodlari = component.map((f) => f.properties.musteri_kodu);

    routeSource.setData({ type: "FeatureCollection", features: component });
    setBackgroundDim(true, componentKodlari);

    const zoomCoords = component.map(
      (f) => f.geometry.coordinates as [number, number]
    );
    if (zoomCoords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
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
        <p>
          <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> tanımlı değil. <br />
          <code>frontend/.env.local</code> dosyasına Mapbox public access
          token&apos;ınızı ekleyip sunucuyu yeniden başlatın.
        </p>
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
