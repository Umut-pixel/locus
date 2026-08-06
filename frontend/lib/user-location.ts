/** Son bilinen kullanıcı konumu — izin bir kez verilince sonraki girişlerde anında merkez. */

const STORAGE_KEY = "locus:last-user-lnglat";

export type StoredUserLocation = {
  lng: number;
  lat: number;
  /** Son başarılı konum anı (ms). */
  at: number;
};

const USER_LOCATE_ZOOM = 12.5;

export function readLastUserLocation(): StoredUserLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUserLocation;
    if (
      typeof parsed?.lng !== "number" ||
      typeof parsed?.lat !== "number" ||
      !Number.isFinite(parsed.lng) ||
      !Number.isFinite(parsed.lat)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastUserLocation(lng: number, lat: number): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredUserLocation = { lng, lat, at: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // private mode / quota
  }
}

/** Harita ilk frame — cache varsa oradan, yoksa Ege varsayılanı. */
export function initialMapViewFromUserLocation(fallback: {
  center: [number, number];
  zoom: number;
}): { center: [number, number]; zoom: number } {
  const last = readLastUserLocation();
  if (!last) return fallback;
  return {
    center: [last.lng, last.lat],
    zoom: USER_LOCATE_ZOOM,
  };
}

export const GEOLOCATE_FIT_OPTIONS = {
  maxZoom: USER_LOCATE_ZOOM,
  padding: 48,
} as const;
