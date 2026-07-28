import type { Map as MapboxMap } from "mapbox-gl";

import {
  clusterCircleOpacityExpr,
  clusterCountOpacityExpr,
  clusterRadiusExpr,
  clusterStrokeOpacityExpr,
  type ClusterConfig,
} from "@/lib/map-clusters";
import { RISK_COLORS } from "@/lib/risk-style";
import type { MusteriFeatureCollection } from "@/lib/geojson";

export const SOURCE_ID = "musteriler";
export const CLUSTER_LAYER = "clusters";
export const CLUSTER_COUNT_LAYER = "cluster-count";
/** Güncellenen noktanın etrafındaki dış halka (point'in altında). */
export const UPDATED_RING_LAYER = "updated-point-ring";
export const POINT_LAYER = "unclustered-point";
export const SELECTED_LAYER = "selected-point";

/** Son yüklemede güncellenen müşteri — açık, net dış halka. */
export const UPDATED_RING_COLOR = "#f4f4f5";

export function applyClusterDimPaint(map: MapboxMap, dimmed: boolean) {
  if (map.getLayer(CLUSTER_LAYER)) {
    map.setPaintProperty(
      CLUSTER_LAYER,
      "circle-opacity",
      clusterCircleOpacityExpr(dimmed)
    );
    map.setPaintProperty(
      CLUSTER_LAYER,
      "circle-stroke-opacity",
      clusterStrokeOpacityExpr(dimmed)
    );
    map.setPaintProperty(CLUSTER_LAYER, "circle-radius", clusterRadiusExpr());
  }
  if (map.getLayer(CLUSTER_COUNT_LAYER)) {
    map.setPaintProperty(
      CLUSTER_COUNT_LAYER,
      "text-opacity",
      clusterCountOpacityExpr(dimmed)
    );
  }
}

export function addCustomerLayers(
  map: MapboxMap,
  dimmed: boolean,
  beforeId?: string
) {
  const before =
    beforeId && map.getLayer(beforeId) ? beforeId : undefined;

  map.addLayer(
    {
      id: CLUSTER_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#e9eaec",
        "circle-radius": clusterRadiusExpr(),
        "circle-opacity": clusterCircleOpacityExpr(dimmed),
        "circle-stroke-width": 5,
        "circle-stroke-color": "rgba(233,234,236,0.22)",
        "circle-stroke-opacity": clusterStrokeOpacityExpr(dimmed),
      },
    },
    before
  );

  map.addLayer(
    {
      id: CLUSTER_COUNT_LAYER,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#1c1d20",
        "text-opacity": clusterCountOpacityExpr(dimmed),
      },
    },
    before
  );

  // Dış halka — risk noktasının altında; sadece son yüklemede güncellenenler
  map.addLayer(
    {
      id: UPDATED_RING_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["==", ["get", "son_yuklemede_guncellendi"], 1],
      ],
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": UPDATED_RING_COLOR,
        "circle-stroke-opacity": 0.95,
        "circle-opacity": 1,
      },
    },
    before
  );

  map.addLayer(
    {
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
    },
    before
  );

  map.addLayer(
    {
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
    },
    before
  );
}

export function recreateCustomerSource(
  map: MapboxMap,
  data: MusteriFeatureCollection,
  cfg: ClusterConfig,
  opts: {
    dimmed: boolean;
    selectedKod: string | null;
    beforeLayerId: string;
  }
) {
  if (!map.getSource(SOURCE_ID)) return;

  const before = map.getLayer(opts.beforeLayerId)
    ? opts.beforeLayerId
    : undefined;

  for (const id of [
    SELECTED_LAYER,
    POINT_LAYER,
    UPDATED_RING_LAYER,
    CLUSTER_COUNT_LAYER,
    CLUSTER_LAYER,
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  map.removeSource(SOURCE_ID);

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: cfg.maxZoom,
    clusterRadius: cfg.radius,
  });

  addCustomerLayers(map, opts.dimmed, before);

  if (map.getLayer(SELECTED_LAYER)) {
    map.setFilter(SELECTED_LAYER, [
      "==",
      ["get", "musteri_kodu"],
      opts.selectedKod ?? "__none__",
    ]);
  }
}
