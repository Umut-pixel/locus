"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { DEFAULT_MAP_VIEW, MAPBOX_STYLE_URL, MAPBOX_TOKEN } from "@/lib/mapbox-style";
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
import { RISK_COLORS } from "@/lib/risk-style";
import type { MusteriFeatureCollection } from "@/lib/geojson";
import type { MusteriHarita } from "@/lib/types";

const SOURCE_ID = "musteriler";
const ROUTE_SOURCE_ID = "route-points";
const ROUTE_LINE_SOURCE_ID = "route-line";
const CLUSTER_LAYER = "clusters";
const CLUSTER_COUNT_LAYER = "cluster-count";
const POINT_LAYER = "unclustered-point";
const SELECTED_LAYER = "selected-point";
const ROUTE_LAYER = "route-highlight";
const ROUTE_GLOW_LAYER = "route-highlight-glow";
const ROUTE_LINE_LAYER = "route-line";
const ROUTE_LINE_CASING_LAYER = "route-line-casing";
const ROUTE_ORDER_LAYER = "route-order-labels";
const ROUTE_HIGHLIGHT_COLOR = "#ffffff";
const ROUTE_LINE_COLOR = "#ffffff";
/** Directions gelene kadar çizgiyi gizle; bu süre dolunca düz çizgi yedeği. */
const ROUTE_SNAP_TIMEOUT_MS = 4000;
const EMPTY_FEATURE_COLLECTION: MusteriFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const EMPTY_LINE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface PetshopMapProps {
  data: MusteriFeatureCollection;
  selectedMusteriKodu: string | null;
  highlightedRutKod: string | null;
  onSelectMusteri: (
    musteri: MusteriHarita | null,
    screenPoint?: { x: number; y: number }
  ) => void;
}

export function PetshopMap({
  data,
  selectedMusteriKodu,
  highlightedRutKod,
  onSelectMusteri,
}: PetshopMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const dataRef = useRef(data);
  const onSelectRef = useRef(onSelectMusteri);
  const routeTweenRef = useRef<RouteRevealTween | null>(null);
  const dataSignatureRef = useRef<string>("");

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    onSelectRef.current = onSelectMusteri;
  }, [onSelectMusteri]);

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

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: dataRef.current,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 45,
      });

      // Kümelenmeyen ayrı kaynak: rota noktaları + ziyaret sırası çizgisi.
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });
      map.addSource(ROUTE_LINE_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_LINE_COLLECTION,
      });

      // Küme baloncukları: parlak mavi yerine UI'daki kırık beyaz
      // primary'nin harita karşılığı — koyu sayı, yumuşak dış halka.
      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#e9eaec",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
          "circle-stroke-width": 5,
          "circle-stroke-color": "rgba(233,234,236,0.22)",
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: { "text-color": "#1c1d20" },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "risk_durumu"],
            "saglikli",
            RISK_COLORS.saglikli,
            "izlenmeli",
            RISK_COLORS.izlenmeli,
            "riskli",
            RISK_COLORS.riskli,
            "hic_teslimat_yok",
            RISK_COLORS.hic_teslimat_yok,
            RISK_COLORS.hic_teslimat_yok,
          ],
          "circle-opacity": [
            "match",
            ["get", "geocode_hassasiyet"],
            "saha_gps",
            1,
            "mahalle_merkezi",
            0.75,
            "ilce_merkezi",
            0.45,
            0.6,
          ],
          "circle-radius": 7,
          "circle-stroke-width": 1.25,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
        },
      });

      // Rota çizgisi (ziyaret_sira sırasıyla) — noktaların altında
      map.addLayer({
        id: ROUTE_LINE_CASING_LAYER,
        type: "line",
        source: ROUTE_LINE_SOURCE_ID,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#0a0a0b",
          "line-width": 2.25,
          "line-opacity": 0.28,
        },
      });
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
          "line-width": 1.25,
          "line-opacity": 0.88,
        },
      });

      map.addLayer({
        id: ROUTE_GLOW_LAYER,
        type: "circle",
        source: ROUTE_SOURCE_ID,
        paint: {
          "circle-radius": 18,
          "circle-color": ROUTE_HIGHLIGHT_COLOR,
          "circle-opacity": 0.25,
          "circle-blur": 0.9,
        },
      });

      map.addLayer({
        id: ROUTE_LAYER,
        type: "circle",
        source: ROUTE_SOURCE_ID,
        paint: {
          "circle-radius": 12,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": ROUTE_HIGHLIGHT_COLOR,
          "circle-stroke-opacity": 1,
        },
      });

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
          "text-halo-color": "#0a0a0b",
          "text-halo-width": 1.5,
        },
      });

      map.addLayer({
        id: SELECTED_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "musteri_kodu"], "__none__"],
        paint: {
          "circle-radius": 11,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#f4f4f5",
        },
      });

      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        className: "petshop-popup",
      });

      map.on("mouseenter", POINT_LAYER, (e) => {
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

      map.on("click", POINT_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        // Anchor'ı tıklama noktasından değil marker merkezinden projekte et
        // ki panel her zaman noktanın kendisine hizalansın.
        const [lon, lat] = feature.geometry.coordinates as [number, number];
        const screen = map.project([lon, lat]);
        onSelectRef.current(feature.properties as MusteriHarita, {
          x: screen.x,
          y: screen.y,
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

      loadedRef.current = true;
    });

    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    // Aynı veri setini tekrar setData etme (gereksiz re-cluster)
    const sig = `${data.features.length}:${data.features[0]?.properties.musteri_kodu ?? ""}:${data.features[data.features.length - 1]?.properties.musteri_kodu ?? ""}`;
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
      if (map.getLayer(CLUSTER_LAYER)) {
        map.setPaintProperty(CLUSTER_LAYER, "circle-opacity", active ? 0.18 : 1);
        map.setPaintProperty(
          CLUSTER_LAYER,
          "circle-stroke-opacity",
          active ? 0.12 : 1
        );
      }
      if (map.getLayer(CLUSTER_COUNT_LAYER)) {
        map.setPaintProperty(CLUSTER_COUNT_LAYER, "text-opacity", active ? 0.2 : 1);
      }
      if (map.getLayer(POINT_LAYER)) {
        if (!active) {
          map.setFilter(POINT_LAYER, ["!", ["has", "point_count"]]);
        } else if (visibleMusteriKodlari && visibleMusteriKodlari.length > 0) {
          map.setFilter(POINT_LAYER, [
            "all",
            ["!", ["has", "point_count"]],
            ["in", ["get", "musteri_kodu"], ["literal", visibleMusteriKodlari]],
          ]);
        } else {
          map.setFilter(POINT_LAYER, [
            "all",
            ["!", ["has", "point_count"]],
            ["==", ["to-string", ["get", "rut_kod"]], String(highlightedRutKod)],
          ]);
        }
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

    const matching = data.features.filter(
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

    // Durakları (bileşen) hemen göster; çizgiyi Directions bitene kadar gizle.
    routeSource.setData({ type: "FeatureCollection", features: component });
    lineSource.setData(EMPTY_LINE_COLLECTION);
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

    if (segments.length === 0) return;

    const ac = new AbortController();
    let cancelled = false;
    let shownRoads = false;

    const paintRoute = (fc: GeoJSON.FeatureCollection) => {
      if (cancelled || !mapRef.current) return;
      killRouteTween();
      void revealRouteLine(
        fc,
        (partial) => {
          if (cancelled || !mapRef.current) return;
          lineSource.setData(partial);
        },
        { duration: 1.25 }
      ).then((tween) => {
        if (cancelled) {
          tween?.kill();
          return;
        }
        routeTweenRef.current = tween;
      });
    };

    const snapPromise = snapSegmentsToRoads(segments, ac.signal);

    const timeoutId = window.setTimeout(() => {
      // Directions henüz gelmediyse kısa süre sonra düz çizgi yedeği
      if (!cancelled && !shownRoads && mapRef.current) {
        paintRoute(straight);
      }
    }, ROUTE_SNAP_TIMEOUT_MS);

    snapPromise
      .then((roadLines) => {
        if (cancelled || !mapRef.current) return;
        window.clearTimeout(timeoutId);
        if (roadLines.features.length > 0) {
          shownRoads = true;
          paintRoute(roadLines);
        } else if (!shownRoads) {
          paintRoute(straight);
        }
      })
      .catch((err) => {
        window.clearTimeout(timeoutId);
        if (cancelled || (err as Error).name === "AbortError") return;
        console.warn("[route] directions failed, using straight lines", err);
        paintRoute(straight);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      killRouteTween();
      ac.abort();
    };
  }, [highlightedRutKod, data, selectedMusteriKodu]);

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
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
