import type { ExpressionSpecification } from "mapbox-gl";

/**
 * Müşteri küme baloncukları.
 * clusterRadius / clusterMaxZoom source oluşturulurken kilitlenir — zoom’da
 * source yenilemek kare kare pop-in yapar. Tek sabit config; küme boyutu
 * paint interpolate ile küçülür, opaklık zoom’da sönmez.
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
 * Tek kaynak config — zoom bandına göre recreate yok.
 * Paint ifadeleri küme yarıçapını zoom ile yumuşatır.
 */
export const STABLE_CLUSTER_CONFIG: ClusterConfig = {
  radius: 52,
  maxZoom: 12,
  band: "stable",
};

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

/** Küme dairesi opacity — zoom'da sönmez; kırılana kadar okunur kalır. */
export function clusterCircleOpacityExpr(dimmed: boolean): number {
  return dimmed ? 0.16 : 1;
}

export function clusterStrokeOpacityExpr(dimmed: boolean): number {
  return dimmed ? 0.1 : 0.55;
}

export function clusterCountOpacityExpr(dimmed: boolean): number {
  return dimmed ? 0.18 : 1;
}

/** Küme yarıçapı da zoom ile küçülür (görsel yumuşatma). */
export function clusterRadiusExpr(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    5,
    ["step", ["get", "point_count"], 20, 10, 26, 30, 32],
    6,
    ["step", ["get", "point_count"], 18, 10, 24, 30, 30],
    9,
    ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
    11,
    ["step", ["get", "point_count"], 14, 10, 18, 30, 22],
    CLUSTER_DISSOLVE_ZOOM,
    ["step", ["get", "point_count"], 14, 10, 16, 30, 18],
  ];
}
