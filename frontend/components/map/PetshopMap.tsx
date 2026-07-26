"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { DEFAULT_MAP_VIEW, MAPBOX_STYLE_URL, MAPBOX_TOKEN } from "@/lib/mapbox-style";
import { RISK_COLORS } from "@/lib/risk-style";
import type { MusteriFeatureCollection } from "@/lib/geojson";
import type { MusteriHarita } from "@/lib/types";

const SOURCE_ID = "musteriler";
const ROUTE_SOURCE_ID = "route-points";
const CLUSTER_LAYER = "clusters";
const CLUSTER_COUNT_LAYER = "cluster-count";
const POINT_LAYER = "unclustered-point";
const SELECTED_LAYER = "selected-point";
const ROUTE_LAYER = "route-highlight";
const ROUTE_GLOW_LAYER = "route-highlight-glow";
const ROUTE_HIGHLIGHT_COLOR = "#22d3ee";
const EMPTY_FEATURE_COLLECTION: MusteriFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface PetshopMapProps {
  data: MusteriFeatureCollection;
  selectedMusteriKodu: string | null;
  highlightedRutKod: string | null;
  onSelectMusteri: (musteri: MusteriHarita | null) => void;
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

      // Kümelenmeyen ayrı kaynak: rota vurgusu, ana katman kümelense bile
      // (uzak zoom seviyelerinde) her zaman tekil noktalarda görünür kalsın.
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#60a5fa",
            10,
            "#3b82f6",
            30,
            "#1d4ed8",
          ],
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
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
        paint: { "text-color": "#ffffff" },
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
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
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
        id: SELECTED_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "musteri_kodu"], "__none__"],
        paint: {
          "circle-radius": 11,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#f8fafc",
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
            `<div style="font-family:ui-monospace,monospace;font-size:11px;line-height:1.45">
              <div style="font-weight:600;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(props.unvan)}</div>
              <div style="opacity:0.65;margin-top:2px">${escapeHtml(props.sehir ?? "")}${props.ilce ? " / " + escapeHtml(props.ilce) : ""}</div>
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
        if (!feature) return;
        onSelectRef.current(feature.properties as MusteriHarita);
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
    source?.setData(data);
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
    if (!routeSource) return;

    if (!highlightedRutKod) {
      routeSource.setData(EMPTY_FEATURE_COLLECTION);
      return;
    }

    const matching = data.features.filter(
      (feature) => feature.properties.rut_kod === highlightedRutKod
    );
    routeSource.setData({ type: "FeatureCollection", features: matching });
    if (matching.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    for (const feature of matching) {
      bounds.extend(feature.geometry.coordinates as [number, number]);
    }
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
  }, [highlightedRutKod, data]);

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
