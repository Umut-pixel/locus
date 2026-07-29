import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import type { MusteriHarita } from "./types";

/**
 * Ardışık ziyaretler bu mesafeyi aşarsa ERP sırası coğrafi olarak kopuk
 * kabul edilir (aynı rut_kod altında İzmir+Muğla karışımı gibi).
 * Çizgi bu kopuklarda bölünür; ekranda yalnızca seçili müşterinin
 * bağlı olduğu bileşen gösterilir.
 */
export const ROUTE_MAX_HOP_KM = 90;

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

function isValidLngLat(c: unknown): c is LngLat {
  if (!Array.isArray(c) || c.length < 2) return false;
  const [lon, lat] = c;
  return (
    typeof lon === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

function sortByZiyaretSira(features: MusteriPointFeature[]): MusteriPointFeature[] {
  return [...features].sort((a, b) => {
    const sa = a.properties.ziyaret_sira;
    const sb = b.properties.ziyaret_sira;
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sa !== sb) return sa - sb;
    return a.properties.musteri_kodu.localeCompare(
      b.properties.musteri_kodu,
      "tr"
    );
  });
}

function dedupeCoords(coords: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (const c of coords) {
    if (!isValidLngLat(c)) continue;
    const prev = out[out.length - 1];
    // Yakın duplicate'leri de at (~1 m) — aynı GPS kopyası çizgiyi kırmaz
    if (
      !prev ||
      Math.abs(prev[0] - c[0]) > 1e-6 ||
      Math.abs(prev[1] - c[1]) > 1e-6
    ) {
      out.push(c);
    }
  }
  return out;
}

/**
 * Ziyaret sırasına göre hop-bağlı bileşenlere ayır.
 * Seçili müşteri varsa yalnızca onun bileşenini döndür — aksi halde
 * ERP'nin coğrafi olarak kopuk "aynı rut" kayıtları iki rota gibi görünür.
 */
export function selectRouteComponent(
  routeFeatures: MusteriPointFeature[],
  options?: {
    selectedMusteriKodu?: string | null;
    maxHopKm?: number;
  }
): MusteriPointFeature[] {
  const maxHopKm = options?.maxHopKm ?? ROUTE_MAX_HOP_KM;
  const sorted = sortByZiyaretSira(routeFeatures).filter((f) =>
    isValidLngLat(f.geometry.coordinates)
  );
  if (sorted.length === 0) return [];

  const components: MusteriPointFeature[][] = [];
  let current: MusteriPointFeature[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].geometry.coordinates as LngLat;
    const next = sorted[i].geometry.coordinates as LngLat;
    if (haversineKm(prev, next) > maxHopKm) {
      components.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  components.push(current);

  const selected = options?.selectedMusteriKodu;
  if (!selected) {
    // Seçim yoksa en kalabalık bileşeni göster (tek "rota" hissi)
    return components.reduce((best, c) =>
      c.length > best.length ? c : best
    );
  }

  const hit = components.find((c) =>
    c.some((f) => f.properties.musteri_kodu === selected)
  );
  return hit ?? components.reduce((best, c) =>
    c.length > best.length ? c : best
  );
}

/** Tek bileşen → Directions / düz çizgi için waypoint listeleri. */
export function buildRouteWaypointSegments(
  routeFeatures: MusteriPointFeature[],
  options?: {
    selectedMusteriKodu?: string | null;
    maxHopKm?: number;
  }
): LngLat[][] {
  const component = selectRouteComponent(routeFeatures, options);
  const coords = dedupeCoords(
    component.map((f) => f.geometry.coordinates as LngLat)
  );
  if (coords.length < 2) return [];
  return [coords];
}

/** Düz (kuş uçuşu) çizgi — Directions başarısız olursa yedek. */
export function buildRouteLineCollection(
  routeFeatures: MusteriPointFeature[],
  options?: {
    selectedMusteriKodu?: string | null;
    maxHopKm?: number;
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
