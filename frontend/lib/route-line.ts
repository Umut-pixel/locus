import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import type { MusteriHarita } from "./types";

/** Ardışık duraklar bu km'yi aşarsa çizgi kesilir (ERP sırası coğrafi değil). */
export const ROUTE_MAX_HOP_KM = 12;

/** Seçili müşterinin ziyaret sırası ± bu kadar komşu bağlanır. */
export const ROUTE_VISIT_WINDOW = 10;

type MusteriPointFeature = Feature<Point, MusteriHarita>;
type LngLat = [number, number];

function haversineKm(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function sortByZiyaretSira(features: MusteriPointFeature[]): MusteriPointFeature[] {
  return [...features].sort((a, b) => {
    const sa = a.properties.ziyaret_sira;
    const sb = b.properties.ziyaret_sira;
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb;
  });
}

function dedupeCoords(coords: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (const c of coords) {
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== c[0] || prev[1] !== c[1]) out.push(c);
  }
  return out;
}

function filterVisitWindow(
  sorted: MusteriPointFeature[],
  selectedMusteriKodu: string | null | undefined,
  visitWindow: number
): MusteriPointFeature[] {
  if (!selectedMusteriKodu) return sorted;
  const selected = sorted.find((f) => f.properties.musteri_kodu === selectedMusteriKodu);
  const sira = selected?.properties.ziyaret_sira;
  if (sira == null) return sorted;
  return sorted.filter((f) => {
    const s = f.properties.ziyaret_sira;
    if (s == null) return f.properties.musteri_kodu === selectedMusteriKodu;
    return Math.abs(s - sira) <= visitWindow;
  });
}

/** Hop limitine göre waypoint segmentleri (Directions / düz çizgi ortak girdi). */
export function buildRouteWaypointSegments(
  routeFeatures: MusteriPointFeature[],
  options?: {
    selectedMusteriKodu?: string | null;
    maxHopKm?: number;
    visitWindow?: number;
  }
): LngLat[][] {
  const maxHopKm = options?.maxHopKm ?? ROUTE_MAX_HOP_KM;
  const visitWindow = options?.visitWindow ?? ROUTE_VISIT_WINDOW;

  const sorted = filterVisitWindow(
    sortByZiyaretSira(routeFeatures),
    options?.selectedMusteriKodu,
    visitWindow
  );

  const coords = dedupeCoords(
    sorted.map((f) => f.geometry.coordinates as LngLat)
  );

  if (coords.length < 2) return [];

  const segments: LngLat[][] = [];
  let current: LngLat[] = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const next = coords[i];
    if (haversineKm(prev, next) > maxHopKm) {
      if (current.length >= 2) segments.push(current);
      current = [next];
    } else {
      current.push(next);
    }
  }
  if (current.length >= 2) segments.push(current);

  return segments;
}

/** Düz (kuş uçuşu) çizgi — Directions başarısız olursa yedek. */
export function buildRouteLineCollection(
  routeFeatures: MusteriPointFeature[],
  options?: {
    selectedMusteriKodu?: string | null;
    maxHopKm?: number;
    visitWindow?: number;
  }
): FeatureCollection<LineString> {
  const segments = buildRouteWaypointSegments(routeFeatures, options);
  return {
    type: "FeatureCollection",
    features: segments.map((lineCoords, i) => ({
      type: "Feature",
      properties: { segment: i, snapped: false },
      geometry: { type: "LineString", coordinates: lineCoords },
    })),
  };
}

export function sortRouteFeatures(
  features: MusteriPointFeature[]
): MusteriPointFeature[] {
  return sortByZiyaretSira(features);
}
