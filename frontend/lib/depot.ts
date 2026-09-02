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

/**
 * Depoya kuş uçuşu mesafe (km).
 *
 * Sevkiyat her yere gidiyor — Bandırma gibi uzak müşteriler sipariş birikince
 * ayrı bir araca yükleniyor (Melih). Havuzda bu sayı görünmezse 300 km'lik
 * bir durak İzmir içi turla aynı listede kaybolur.
 */
export function depoyaKm(nokta: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (nokta.lat - DEPOT.lat) * rad;
  const dLon = (nokta.lon - DEPOT.lon) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(DEPOT.lat * rad) *
      Math.cos(nokta.lat * rad) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function googleMapsDirUrl(
  stops: ReadonlyArray<{ lat: number; lon: number }>,
  opts?: { includeDepot?: boolean; roundTrip?: boolean }
): string {
  const includeDepot = opts?.includeDepot !== false;
  const roundTrip = opts?.roundTrip === true;
  const stopStr = stops.map((s) => `${s.lat},${s.lon}`);

  if (includeDepot) {
    const depot = `${DEPOT.lat},${DEPOT.lon}`;
    if (stopStr.length === 0) {
      return `https://www.google.com/maps/search/?api=1&query=${depot}`;
    }
    if (roundTrip) {
      const params = new URLSearchParams({
        api: "1",
        travelmode: "driving",
        origin: depot,
        destination: depot,
      });
      params.set("waypoints", stopStr.join("|"));
      return `https://www.google.com/maps/dir/?${params.toString()}`;
    }
    const destination = stopStr[stopStr.length - 1]!;
    const mid = stopStr.slice(0, -1);
    const params = new URLSearchParams({
      api: "1",
      travelmode: "driving",
      origin: depot,
      destination,
    });
    if (mid.length > 0) params.set("waypoints", mid.join("|"));
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
