import type { Map as MapboxMap } from "mapbox-gl";

import {
  clusterCircleOpacityExpr,
  clusterCountOpacityExpr,
  clusterRadiusExpr,
  clusterStrokeOpacityExpr,
  type ClusterConfig,
} from "@/lib/map-clusters";
import { RISK_COLORS } from "@/lib/risk-style";
import { tipStrokeColorExpr } from "@/lib/tip-style";
import type { MusteriFeatureCollection } from "@/lib/geojson";

export const SOURCE_ID = "musteriler";
export const CLUSTER_LAYER = "clusters";
export const CLUSTER_COUNT_LAYER = "cluster-count";
/** Güncellenen noktanın etrafındaki dış halka (point'in altında). */
export const UPDATED_RING_LAYER = "updated-point-ring";
/** Kanal renginde bulanık hale — unclustered-point'in altında. */
export const MARKER_HALO_LAYER = "marker-halo";
export const POINT_LAYER = "unclustered-point";
/** Görünmez dokunma alanı — görsel noktadan büyük. */
export const POINT_HIT_LAYER = "unclustered-point-hit";
export const SELECTED_LAYER = "selected-point";

/** Son yüklemede güncellenen müşteri — koyu basemap'te net açık halka. */
export const UPDATED_RING_COLOR = "#f4f4f5";
/** "Sonra bak" favori — nokta üzerinde Airbnb Rausch halka. */
export const MUSTERI_FAVORI_STROKE = "#ff385c";

/** Dokunma hedefi (~36–44px); görsel yarıçap ayrı kalır. */
export const POINT_HIT_RADIUS = 18;
export const POINT_VISUAL_RADIUS = 7;
export const POINT_SELECTED_RADIUS = 9;
export const HALO_BASE_RADIUS = 13;

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
        "circle-color": "#FFFFFF",
        "circle-radius": clusterRadiusExpr(),
        "circle-opacity": clusterCircleOpacityExpr(dimmed),
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(28,29,32,0.42)",
        "circle-stroke-opacity": clusterStrokeOpacityExpr(dimmed),
        "circle-emissive-strength": 1,
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
        "text-emissive-strength": 1,
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
        "circle-emissive-strength": 1,
      },
    },
    before
  );

  // Kanal renginde bulanık hale — unclustered-point'in altında
  map.addLayer(
    {
      id: MARKER_HALO_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          15,
          HALO_BASE_RADIUS,
        ],
        "circle-color": tipStrokeColorExpr("#d4d4d8"),
        "circle-blur": 0.8,
        "circle-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.28,
          0.2,
        ],
        "circle-emissive-strength": 1,
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
        // Fill = risk durumu — anında okunabilir birincil gösterge
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
        // Düşük geocode hassasiyeti → hafif solma (renk okunabilirliği korunur)
        "circle-opacity": [
          "match",
          ["get", "geocode_hassasiyet"],
          "saha_gps",
          1,
          "mahalle_merkezi",
          0.95,
          "ilce_merkezi",
          0.88,
          0.92,
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          ["case", ["boolean", ["feature-state", "hover"], false], 7, 6],
          8,
          ["case", ["boolean", ["feature-state", "hover"], false], 8, POINT_VISUAL_RADIUS],
          12,
          ["case", ["boolean", ["feature-state", "hover"], false], 8, POINT_VISUAL_RADIUS],
        ],
        // Stroke = kanal tipi (petshop / veteriner); favori = kırmızı
        "circle-stroke-width": 2.5,
        "circle-stroke-color": [
          "case",
          ["boolean", ["get", "favori"], false],
          MUSTERI_FAVORI_STROKE,
          tipStrokeColorExpr("#d4d4d8"),
        ],
        "circle-stroke-opacity": 1,
        "circle-emissive-strength": 1,
      },
    },
    before
  );

  // Geniş görünmez hit — dokunmatikte kolay seçim
  map.addLayer(
    {
      id: POINT_HIT_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6,
          22,
          10,
          POINT_HIT_RADIUS,
          14,
          16,
        ],
        "circle-color": "#000000",
        "circle-opacity": 0,
        "circle-stroke-width": 0,
        "circle-emissive-strength": 0,
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
        "circle-radius": POINT_SELECTED_RADIUS,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 3,
        "circle-stroke-color": tipStrokeColorExpr("#a5b4fc"),
        "circle-emissive-strength": 1,
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
    POINT_HIT_LAYER,
    POINT_LAYER,
    MARKER_HALO_LAYER,
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
    promoteId: "musteri_kodu",
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
