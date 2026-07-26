import type { Feature, FeatureCollection, LineString } from "geojson";

import { MAPBOX_TOKEN } from "./mapbox-style";

/** Directions API tek istekte en fazla 25 waypoint kabul eder. */
const MAX_WAYPOINTS = 25;

type LngLat = [number, number];

/**
 * Mapbox Directions (driving) — noktaları yollara oturtur.
 * Başarısız olursa null döner (çağıran düz çizgiye düşer).
 */
export async function fetchDrivingRoute(
  waypoints: LngLat[],
  signal?: AbortSignal
): Promise<LngLat[] | null> {
  if (!MAPBOX_TOKEN || waypoints.length < 2) return null;

  const chunks = chunkWaypoints(waypoints, MAX_WAYPOINTS);
  const merged: LngLat[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const path = await fetchDrivingChunk(chunk, signal);
    if (!path || path.length < 2) return null;

    if (i === 0) {
      merged.push(...path);
    } else {
      // Chunk'lar 1 nokta örtüşmeli; tekrarlayan ilk noktayı at
      merged.push(...path.slice(1));
    }
  }

  return merged.length >= 2 ? merged : null;
}

export async function snapSegmentsToRoads(
  segments: LngLat[][],
  signal?: AbortSignal
): Promise<FeatureCollection<LineString>> {
  const features: Feature<LineString>[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.length < 2) continue;

    const road = await fetchDrivingRoute(seg, signal);
    const coords = road ?? seg;

    features.push({
      type: "Feature",
      properties: { segment: i, snapped: Boolean(road) },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  return { type: "FeatureCollection", features };
}

function chunkWaypoints(waypoints: LngLat[], size: number): LngLat[][] {
  if (waypoints.length <= size) return [waypoints];

  const chunks: LngLat[][] = [];
  let start = 0;
  while (start < waypoints.length - 1) {
    const end = Math.min(start + size, waypoints.length);
    chunks.push(waypoints.slice(start, end));
    // Sonraki chunk bir önceki son noktadan başlasın (süreklilik)
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
