/**
 * Ana depo — Menderes / İzmir.
 * Saha koordinatı (2026-08-28): Hürriyet, Yeni Keresteciler Sitesi No:71.
 */
export const DEPOT = {
  label: "Ana Depo",
  address: "Hürriyet, Yeni Keresteciler Sitesi No:71, 35473 Menderes/İzmir",
  lat: 38.28801183350053,
  lon: 27.141092424481496,
  /** [lon, lat] — Mapbox GeoJSON sırası */
  lngLat: [27.141092424481496, 38.28801183350053] as [number, number],
} as const;

export function googleMapsDirUrl(
  stops: ReadonlyArray<{ lat: number; lon: number }>,
  opts?: { includeDepot?: boolean }
): string {
  const includeDepot = opts?.includeDepot !== false;
  const stopStr = stops.map((s) => `${s.lat},${s.lon}`);

  if (includeDepot) {
    const origin = `${DEPOT.lat},${DEPOT.lon}`;
    const params = new URLSearchParams({
      api: "1",
      travelmode: "driving",
      origin,
      destination: origin,
    });
    if (stopStr.length > 0) params.set("waypoints", stopStr.join("|"));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  if (stopStr.length === 0) {
    return `https://www.google.com/maps/search/?api=1&query=${DEPOT.lat},${DEPOT.lon}`;
  }
  if (stopStr.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${stopStr[0]}`;
  }

  const origin = stopStr[0]!;
  const destination = stopStr[stopStr.length - 1]!;
  const mid = stopStr.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    origin,
    destination,
  });
  if (mid.length > 0) params.set("waypoints", mid.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
