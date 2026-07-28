/**
 * Mapbox Studio stilleri (hesap: umutt).
 * Aynı NEXT_PUBLIC_MAPBOX_TOKEN her iki stil için yeterlidir —
 * ayrı bir "style token" gerekmez (stil hesabın altındaysa / public ise).
 */
export const MAPBOX_STYLE_URL_DARK =
  "mapbox://styles/umutt/cms05mge200p701qz7pld78tv";

export const MAPBOX_STYLE_URL_LIGHT =
  "mapbox://styles/umutt/cms4k1fmv000901sf31wic8lw";

/** @deprecated Yerine mapStyleForTheme kullanın — varsayılan dark. */
export const MAPBOX_STYLE_URL = MAPBOX_STYLE_URL_DARK;

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export type MapTheme = "light" | "dark";

export function mapStyleForTheme(theme: MapTheme): string {
  return theme === "light" ? MAPBOX_STYLE_URL_LIGHT : MAPBOX_STYLE_URL_DARK;
}

/** Türkiye Ege bölgesi ağırlıklı veri seti için başlangıç görünümü. */
export const DEFAULT_MAP_VIEW = {
  center: [27.6, 38.4] as [number, number],
  zoom: 6.8,
};
