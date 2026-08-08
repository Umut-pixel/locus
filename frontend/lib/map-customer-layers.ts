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
/** Petshop / veteriner — risk noktasının çevresinde renkli halka. */
export const TIP_RING_LAYER = "tip-point-ring";
export const POINT_LAYER = "unclustered-point";
/** Görünmez dokunma alanı — görsel noktadan büyük. */
export const POINT_HIT_LAYER = "unclustered-point-hit";
export const SELECTED_LAYER = "selected-point";

/** Son yüklemede güncellenen müşteri — açık, net dış halka. */
export const UPDATED_RING_COLOR = "#f4f4f5";
/** "Sonra bak" favori — nokta üzerinde Airbnb Rausch halka. */
export const MUSTERI_FAVORI_STROKE = "#ff385c";

/** Dokunma hedefi (~36–44px); görsel yarıçap ayrı kalır. */
export const POINT_HIT_RADIUS = 18;
export const POINT_VISUAL_RADIUS = 7;
/** Tip halkası — point ile updated ring arasında. */
export const TIP_RING_RADIUS = 10;

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
  beforeId?: string,
  opts?: { tipRingVisible?: boolean }
) {
  const before =
    beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  const tipVisible = opts?.tipRingVisible !== false ? "visible" : "none";

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

  // Tip halkası — petshop (cyan) / veteriner (fuchsia); risk fill bozulmaz
  map.addLayer(
    {
      id: TIP_RING_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        [
          "any",
          ["==", ["get", "tip_kanal"], "petshop"],
          ["==", ["get", "tip_kanal"], "veteriner"],
        ],
      ],
      layout: { visibility: tipVisible },
      paint: {
        "circle-radius": TIP_RING_RADIUS,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": tipStrokeColorExpr(),
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
        "circle-radius": POINT_VISUAL_RADIUS,
        "circle-stroke-width": [
          "case",
          ["boolean", ["get", "favori"], false],
          2.75,
          1.25,
        ],
        "circle-stroke-color": [
          "case",
          ["boolean", ["get", "favori"], false],
          MUSTERI_FAVORI_STROKE,
          "rgba(255,255,255,0.85)",
        ],
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
    tipRingVisible?: boolean;
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
    TIP_RING_LAYER,
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

  addCustomerLayers(map, opts.dimmed, before, {
    tipRingVisible: opts.tipRingVisible,
  });

  if (map.getLayer(SELECTED_LAYER)) {
    map.setFilter(SELECTED_LAYER, [
      "==",
      ["get", "musteri_kodu"],
      opts.selectedKod ?? "__none__",
    ]);
  }
}

export function setCustomerTipRingVisibility(
  map: MapboxMap,
  visible: boolean
) {
  if (!map.getLayer(TIP_RING_LAYER)) return;
  map.setLayoutProperty(
    TIP_RING_LAYER,
    "visibility",
    visible ? "visible" : "none"
  );
}
