import type { ExpressionSpecification } from "mapbox-gl";

/**
 * Müşteri küme baloncukları — zoom’a göre dinamik yarıçap / kırılma.
 * Mapbox `clusterRadius` / `clusterMaxZoom` yalnızca source oluşturulurken
 * sayısal verilebilir; bu yüzden zoom bandı değişince source yenilenir.
 * Görünürlük ayrıca paint `["zoom"]` interpolate ile yumuşak söner.
 */

export type ClusterConfig = {
  /** GeoJSONSource clusterRadius (px) */
  radius: number;
  /** Bu zoom’un üstünde küme yok — tekil noktalar */
  maxZoom: number;
  /** Band kimliği — gereksiz source recreate engeli */
  band: string;
};

/** Küme baloncuklarının tamamen söndüğü / kırıldığı zoom. */
export const CLUSTER_DISSOLVE_ZOOM = 12;

/**
 * Mevcut kamera zoom’una göre küme parametreleri.
 * Yakınlaştıkça yarıçap küçülür; maxZoom erken kırılım sağlar.
 */
export function clusterConfigForZoom(zoom: number): ClusterConfig {
  if (zoom < 7) {
    return { radius: 68, maxZoom: 11, band: "far" };
  }
  if (zoom < 9) {
    return { radius: 54, maxZoom: 11, band: "region" };
  }
  if (zoom < 10.5) {
    return { radius: 42, maxZoom: 12, band: "city" };
  }
  if (zoom < 12) {
    return { radius: 30, maxZoom: 12, band: "district" };
  }
  return { radius: 22, maxZoom: 12, band: "street" };
}

/** Küme dairesi opacity — zoom ile kaybolur (dimmed: rota vurgusu). */
export function clusterCircleOpacityExpr(
  dimmed: boolean
): ExpressionSpecification {
  const peak = dimmed ? 0.16 : 1;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    7,
    peak,
    9,
    peak,
    10.5,
    peak * 0.75,
    11.4,
    peak * 0.28,
    CLUSTER_DISSOLVE_ZOOM,
    0,
  ];
}

export function clusterStrokeOpacityExpr(
  dimmed: boolean
): ExpressionSpecification {
  const peak = dimmed ? 0.1 : 1;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    7,
    peak * 0.22,
    10.5,
    peak * 0.18,
    11.4,
    peak * 0.06,
    CLUSTER_DISSOLVE_ZOOM,
    0,
  ];
}

export function clusterCountOpacityExpr(
  dimmed: boolean
): ExpressionSpecification {
  const peak = dimmed ? 0.18 : 1;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    7,
    peak,
    10.5,
    peak * 0.7,
    11.4,
    peak * 0.2,
    CLUSTER_DISSOLVE_ZOOM,
    0,
  ];
}

/** Küme yarıçapı da zoom ile küçülür (görsel yumuşatma). */
export function clusterRadiusExpr(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    6,
    ["step", ["get", "point_count"], 18, 10, 24, 30, 30],
    9,
    ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
    11,
    ["step", ["get", "point_count"], 12, 10, 16, 30, 20],
    CLUSTER_DISSOLVE_ZOOM,
    ["step", ["get", "point_count"], 6, 10, 8, 30, 10],
  ];
}
