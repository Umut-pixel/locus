/**
 * Dark-mode basemap — Mapbox Studio (hesap: umutt, stil: Standard).
 * Mapbox Standard import: lightPreset `dusk`, globe projeksiyon.
 * Overlay katmanlarına `slot` verilmez: Standard `top` slotu yer etiketlerinin
 * altında kalır ve uzak zoom düzeyinde kümeleri örter. Slot'suz katman stil yığınının
 * üstünde durur.
 * Token: NEXT_PUBLIC_MAPBOX_TOKEN (Directions + Styles + Standard tiles).
 */
export const MAPBOX_STYLE_URL_DARK =
  "mapbox://styles/umutt/cmsyohbh100bj01secuy6hmdo";

/**
 * Light-mode basemap — Mapbox Studio "Faded"
 * (`cmtdevw9w002301s5hzpq9xy3`): Standard `theme: faded`, `lightPreset: day`,
 * yollar beyaz.
 */
export const MAPBOX_STYLE_URL_LIGHT =
  "mapbox://styles/umutt/cmtdevw9w002301s5hzpq9xy3";

/** Eski ad — koyu stil. Yeni kod `mapboxStyleForTheme` kullansın. */
export const MAPBOX_STYLE_URL = MAPBOX_STYLE_URL_DARK;

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export type MapTheme = "light" | "dark";

export function currentDocumentMapTheme(): MapTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function mapboxStyleForTheme(theme: MapTheme): string {
  return theme === "light" ? MAPBOX_STYLE_URL_LIGHT : MAPBOX_STYLE_URL_DARK;
}

/** Mapbox Standard import config — Faded export ile aynı yol renkleri. */
export function mapboxBasemapConfig(theme: MapTheme) {
  if (theme === "light") {
    return {
      show3dObjects: false,
      theme: "faded",
      lightPreset: "day",
      colorTrunks: "hsl(235, 0%, 100%)",
      colorRoads: "hsl(224, 0%, 100%)",
      colorMotorways: "hsl(214, 0%, 100%)",
    };
  }
  return {
    show3dObjects: false,
    lightPreset: "dusk",
  };
}

/** Türkiye Ege bölgesi ağırlıklı veri seti için başlangıç görünümü. */
export const DEFAULT_MAP_VIEW = {
  center: [27.6, 38.4] as [number, number],
  zoom: 6.8,
};
