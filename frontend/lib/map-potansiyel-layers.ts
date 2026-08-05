import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";

import {
  clusterCircleOpacityExpr,
  clusterCountOpacityExpr,
  clusterRadiusExpr,
  clusterStrokeOpacityExpr,
  type ClusterConfig,
} from "@/lib/map-clusters";
import type { PotansiyelFeatureCollection } from "@/lib/potansiyel-geojson";

export const POTANSIYEL_SOURCE_ID = "potansiyeller";
export const POTANSIYEL_CLUSTER_LAYER = "potansiyel-clusters";
export const POTANSIYEL_CLUSTER_COUNT_LAYER = "potansiyel-cluster-count";
export const POTANSIYEL_POINT_LAYER = "potansiyel-point";
export const POTANSIYEL_POINT_HIT_LAYER = "potansiyel-point-hit";
export const POTANSIYEL_SELECTED_LAYER = "potansiyel-selected";

/** Müşteri risk paletine karışmayan nötr teal. */
export const POTANSIYEL_COLOR = "#5eead4";
export const POTANSIYEL_STROKE = "#0f766e";
/** Küme balonu — müşteri gri’sinden ayrılan teal-gri */
export const POTANSIYEL_CLUSTER_FILL = "#99f6e4";
export const POTANSIYEL_CLUSTER_TEXT = "#134e4a";

const EMPTY: PotansiyelFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const LAYER_IDS = [
  POTANSIYEL_SELECTED_LAYER,
  POTANSIYEL_POINT_HIT_LAYER,
  POTANSIYEL_POINT_LAYER,
  POTANSIYEL_CLUSTER_COUNT_LAYER,
  POTANSIYEL_CLUSTER_LAYER,
] as const;

export function addPotansiyelLayers(
  map: MapboxMap,
  cfg: ClusterConfig,
  opts?: { visible?: boolean; beforeId?: string }
) {
  const before =
    opts?.beforeId && map.getLayer(opts.beforeId) ? opts.beforeId : undefined;
  const visibility = opts?.visible ? "visible" : "none";

  if (!map.getSource(POTANSIYEL_SOURCE_ID)) {
    map.addSource(POTANSIYEL_SOURCE_ID, {
      type: "geojson",
      data: EMPTY,
      cluster: true,
      clusterMaxZoom: cfg.maxZoom,
      clusterRadius: cfg.radius,
    });
  }

  if (!map.getLayer(POTANSIYEL_CLUSTER_LAYER)) {
    map.addLayer(
      {
        id: POTANSIYEL_CLUSTER_LAYER,
        type: "circle",
        source: POTANSIYEL_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: { visibility },
        paint: {
          "circle-color": POTANSIYEL_CLUSTER_FILL,
          "circle-radius": clusterRadiusExpr(),
          "circle-opacity": clusterCircleOpacityExpr(false),
          "circle-stroke-width": 5,
          "circle-stroke-color": "rgba(153,246,228,0.28)",
          "circle-stroke-opacity": clusterStrokeOpacityExpr(false),
        },
      },
      before
    );
  }

  if (!map.getLayer(POTANSIYEL_CLUSTER_COUNT_LAYER)) {
    map.addLayer(
      {
        id: POTANSIYEL_CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: POTANSIYEL_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          visibility,
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: {
          "text-color": POTANSIYEL_CLUSTER_TEXT,
          "text-opacity": clusterCountOpacityExpr(false),
        },
      },
      before
    );
  }

  if (!map.getLayer(POTANSIYEL_POINT_LAYER)) {
    map.addLayer(
      {
        id: POTANSIYEL_POINT_LAYER,
        type: "circle",
        source: POTANSIYEL_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: { visibility },
        paint: {
          "circle-color": POTANSIYEL_COLOR,
          "circle-radius": 7,
          "circle-stroke-width": 1.25,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
          "circle-opacity": [
            "case",
            ["==", ["get", "kalite_bayragi"], "suspicious_name"],
            0.35,
            0.9,
          ],
          "circle-stroke-opacity": [
            "case",
            ["==", ["get", "kalite_bayragi"], "suspicious_name"],
            0.4,
            0.95,
          ],
        },
      },
      before
    );
  }

  if (!map.getLayer(POTANSIYEL_POINT_HIT_LAYER)) {
    map.addLayer(
      {
        id: POTANSIYEL_POINT_HIT_LAYER,
        type: "circle",
        source: POTANSIYEL_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: { visibility },
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            22,
            10,
            18,
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
  }

  if (!map.getLayer(POTANSIYEL_SELECTED_LAYER)) {
    map.addLayer(
      {
        id: POTANSIYEL_SELECTED_LAYER,
        type: "circle",
        source: POTANSIYEL_SOURCE_ID,
        filter: ["==", ["get", "id"], "__none__"],
        layout: { visibility },
        paint: {
          // Müşteri selected-point ile aynı yarıçap
          "circle-radius": 11,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": POTANSIYEL_COLOR,
        },
      },
      before
    );
  }
}

export function recreatePotansiyelSource(
  map: MapboxMap,
  data: PotansiyelFeatureCollection,
  cfg: ClusterConfig,
  opts: {
    visible: boolean;
    selectedId: string | null;
    beforeLayerId?: string;
  }
) {
  if (!map.getSource(POTANSIYEL_SOURCE_ID)) return;

  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  map.removeSource(POTANSIYEL_SOURCE_ID);

  map.addSource(POTANSIYEL_SOURCE_ID, {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: cfg.maxZoom,
    clusterRadius: cfg.radius,
  });

  addPotansiyelLayers(map, cfg, {
    visible: opts.visible,
    beforeId: opts.beforeLayerId,
  });
  setPotansiyelSelectedId(map, opts.selectedId);
}

export function setPotansiyelVisibility(map: MapboxMap, visible: boolean) {
  const v = visible ? "visible" : "none";
  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", v);
    }
  }
}

export function setPotansiyelSelectedId(map: MapboxMap, id: string | null) {
  if (!map.getLayer(POTANSIYEL_SELECTED_LAYER)) return;
  map.setFilter(POTANSIYEL_SELECTED_LAYER, [
    "==",
    ["get", "id"],
    id ?? "__none__",
  ]);
}

export function setPotansiyelData(
  map: MapboxMap,
  data: PotansiyelFeatureCollection
) {
  const source = map.getSource(POTANSIYEL_SOURCE_ID) as
    | GeoJSONSource
    | undefined;
  source?.setData(data);
}
