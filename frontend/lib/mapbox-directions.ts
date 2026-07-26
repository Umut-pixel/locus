import type { Feature, FeatureCollection, LineString } from "geojson";

import { MAPBOX_TOKEN } from "./mapbox-style";

/** Directions API tek istekte en fazla 25 waypoint kabul eder. */
const MAX_WAYPOINTS = 25;
/** Bellek cache — aynı rota tekrarında ağ çağrısını atlar. */
const CACHE_MAX = 48;

type LngLat = [number, number];

const routeCache = new Map<string, LngLat[]>();

function cacheKey(waypoints: LngLat[]): string {
  return waypoints.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(";");
}

function cacheGet(key: string): LngLat[] | undefined {
  const hit = routeCache.get(key);
  if (!hit) return undefined;
  // LRU: yeniden ekle
  routeCache.delete(key);
  routeCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: LngLat[]): void {
  if (routeCache.has(key)) routeCache.delete(key);
  routeCache.set(key, value);
  while (routeCache.size > CACHE_MAX) {
    const oldest = routeCache.keys().next().value;
    if (oldest == null) break;
    routeCache.delete(oldest);
  }
}

/**
 * Mapbox Directions (driving) — noktaları yollara oturtur.
 * Başarısız olursa null döner (çağıran düz çizgiye düşer).
 */
export async function fetchDrivingRoute(
  waypoints: LngLat[],
  signal?: AbortSignal
): Promise<LngLat[] | null> {
  if (!MAPBOX_TOKEN || waypoints.length < 2) return null;

  const key = cacheKey(waypoints);
  const cached = cacheGet(key);
  if (cached) return cached;

  const chunks = chunkWaypoints(waypoints, MAX_WAYPOINTS);
  const merged: LngLat[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const path = await fetchDrivingChunk(chunk, signal);
    if (!path || path.length < 2) return null;

    if (i === 0) {
      merged.push(...path);
    } else {
      merged.push(...path.slice(1));
    }
  }

  if (merged.length >= 2) {
    cacheSet(key, merged);
    return merged;
  }
  return null;
}

export async function snapSegmentsToRoads(
  segments: LngLat[][],
  signal?: AbortSignal
): Promise<FeatureCollection<LineString>> {
  const features: Feature<LineString>[] = [];

  // Segmentleri sınırlı paralellikte çek (sıralıya göre hızlı, rate-limit dostu)
  const CONCURRENCY = 2;
  for (let i = 0; i < segments.length; i += CONCURRENCY) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = segments.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (seg, j) => {
        if (seg.length < 2) return null;
        const road = await fetchDrivingRoute(seg, signal);
        return {
          index: i + j,
          coords: road ?? seg,
          snapped: Boolean(road),
        };
      })
    );

    for (const r of results) {
      if (!r) continue;
      features.push({
        type: "Feature",
        properties: { segment: r.index, snapped: r.snapped },
        geometry: { type: "LineString", coordinates: r.coords },
      });
    }
  }

  features.sort(
    (a, b) =>
      Number(a.properties?.segment ?? 0) - Number(b.properties?.segment ?? 0)
  );

  return { type: "FeatureCollection", features };
}

function chunkWaypoints(waypoints: LngLat[], size: number): LngLat[][] {
  if (waypoints.length <= size) return [waypoints];

  const chunks: LngLat[][] = [];
  let start = 0;
  while (start < waypoints.length - 1) {
    const end = Math.min(start + size, waypoints.length);
    chunks.push(waypoints.slice(start, end));
    start = end - 1;
    if (end === waypoints.length) break;
  }
  return chunks;
}

async function fetchDrivingChunk(
  waypoints: LngLat[],
  signal?: AbortSignal
): Promise<LngLat[] | null> {
  const coordStr = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
    `?alternatives=false&geometries=geojson&overview=full&steps=false` +
    `&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      console.warn("[directions]", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as {
      routes?: Array<{ geometry?: { coordinates?: LngLat[] } }>;
      code?: string;
    };
    if (json.code && json.code !== "Ok") {
      console.warn("[directions] code:", json.code);
      return null;
    }
    const coords = json.routes?.[0]?.geometry?.coordinates;
    return coords && coords.length >= 2 ? coords : null;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    console.warn("[directions]", err);
    return null;
  }
}
