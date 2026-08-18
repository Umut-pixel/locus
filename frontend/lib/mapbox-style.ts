/**
 * Dark-mode basemap — Mapbox Studio (hesap: umutt, stil: Standard).
 * Mapbox Standard import: lightPreset `dusk`, globe projeksiyon.
 * sources/sprite/glyphs mapbox:// ile barınıyor; style.json kopyalamaya gerek yok.
 * Token: NEXT_PUBLIC_MAPBOX_TOKEN (Directions + Styles + Standard tiles).
 */
export const MAPBOX_STYLE_URL =
  "mapbox://styles/umutt/cmsyohbh100bj01secuy6hmdo";

/**
 * Mapbox Standard slot'ları: bottom / middle / top.
 * Overlay (müşteri, potansiyel, rota) `top`'ta durur — 3D binaların üstünde.
 * Classic light stilinde `slot` yok sayılır.
 */
export const MAP_OVERLAY_SLOT = "top" as const;

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Türkiye Ege bölgesi ağırlıklı veri seti için başlangıç görünümü. */
export const DEFAULT_MAP_VIEW = {
  center: [27.6, 38.4] as [number, number],
  zoom: 6.8,
};
