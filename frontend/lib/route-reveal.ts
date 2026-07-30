import type { Feature, FeatureCollection, LineString } from "geojson";

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

function lineLengthKm(coords: LngLat[]): number {
  let len = 0;
  for (let i = 1; i < coords.length; i++) {
    len += haversineKm(coords[i - 1], coords[i]);
  }
  return len;
}

function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Segment kenar uzunlukları önceden hesaplanır — her slice'ta haversine yok. */
function sliceLineByFraction(
  coords: LngLat[],
  edgeLens: number[],
  totalLen: number,
  fraction: number
): LngLat[] {
  if (coords.length < 2) return coords;
  if (fraction <= 0) return [coords[0], coords[0]];
  if (fraction >= 1) return coords;

  if (totalLen <= 0) return coords.slice(0, 2);

  const target = totalLen * fraction;
  let acc = 0;
  const out: LngLat[] = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const seg = edgeLens[i - 1] ?? 0;
    if (acc + seg >= target) {
      const t = seg > 0 ? (target - acc) / seg : 0;
      out.push(lerp(coords[i - 1], coords[i], t));
      return out;
    }
    out.push(coords[i]);
    acc += seg;
  }
  return out;
}

type PreparedSegment = {
  coords: LngLat[];
  edgeLens: number[];
  length: number;
  props: Record<string, unknown>;
};

function prepareSegments(full: FeatureCollection): PreparedSegment[] {
  const out: PreparedSegment[] = [];

  for (const f of full.features) {
    if (f.geometry?.type !== "LineString") continue;
    const coords = f.geometry.coordinates as LngLat[];
    if (coords.length < 2) continue;
    const edgeLens: number[] = [];
    let length = 0;
    for (let i = 1; i < coords.length; i++) {
      const seg = haversineKm(coords[i - 1], coords[i]);
      edgeLens.push(seg);
      length += seg;
    }
    out.push({
      coords,
      edgeLens,
      length,
      props: (f.properties ?? {}) as Record<string, unknown>,
    });
  }
  return out;
}

function slicePrepared(
  segments: PreparedSegment[],
  progress: number
): FeatureCollection<LineString> {
  const t = Math.min(1, Math.max(0, progress));
  const totalLen =
    segments.reduce((sum, s) => sum + Math.max(s.length, 1e-6), 0) || 1;
  let remaining = totalLen * t;

  const features: Feature<LineString>[] = [];

  for (const seg of segments) {
    if (remaining <= 0) break;
    const len = Math.max(seg.length, 1e-6);

    if (remaining >= len - 1e-9) {
      features.push({
        type: "Feature",
        properties: { ...seg.props },
        geometry: { type: "LineString", coordinates: seg.coords },
      });
      remaining -= len;
    } else {
      const partial = sliceLineByFraction(
        seg.coords,
        seg.edgeLens,
        seg.length,
        remaining / len
      );
      if (partial.length >= 2) {
        features.push({
          type: "Feature",
          properties: { ...seg.props },
          geometry: { type: "LineString", coordinates: partial },
        });
      }
      remaining = 0;
    }
  }

  return { type: "FeatureCollection", features };
}

/** Public API — test / fallback; hazırlık maliyeti her çağrıda. */
export function sliceRouteCollection(
  full: FeatureCollection,
  progress: number
): FeatureCollection<LineString> {
  return slicePrepared(prepareSegments(full), progress);
}

export type RouteRevealTween = { kill: () => void };

/**
 * GSAP lazy-load — sadece rota gösterilirken chunk'a girer.
 * setData rAF ile tek frame'de bir kez; uzunluklar önceden hesaplanır.
 */
export async function revealRouteLine(
  full: FeatureCollection,
  setData: (fc: FeatureCollection) => void,
  options?: { duration?: number; signal?: AbortSignal }
): Promise<RouteRevealTween | null> {
  const duration = options?.duration ?? 1.25;
  const signal = options?.signal;
  const segments = prepareSegments(full);
  if (segments.length === 0) {
    if (!signal?.aborted) setData(full);
    return null;
  }

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    if (!signal?.aborted) setData(full);
    return null;
  }

  const { default: gsap } = await import("gsap");
  if (signal?.aborted) return null;

  let rafId = 0;
  let pendingT: number | null = null;

  const flush = () => {
    rafId = 0;
    if (pendingT == null || signal?.aborted) return;
    const t = pendingT;
    pendingT = null;
    setData(t >= 1 ? full : slicePrepared(segments, t));
  };

  const schedule = (t: number) => {
    pendingT = t;
    if (rafId === 0) {
      rafId = requestAnimationFrame(flush);
    }
  };

  schedule(0.001);

  const state = { t: 0 };
  const tween = gsap.to(state, {
    t: 1,
    duration,
    ease: "power2.inOut",
    onUpdate: () => {
      if (signal?.aborted) return;
      schedule(state.t);
    },
    onComplete: () => {
      if (signal?.aborted) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      pendingT = null;
      setData(full);
    },
  });

  const killAll = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    pendingT = null;
    tween.kill();
  };

  const onAbort = () => {
    killAll();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  return {
    kill: () => {
      signal?.removeEventListener("abort", onAbort);
      killAll();
    },
  };
}
