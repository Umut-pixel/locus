/**
 * Dark-mode basemap — Mapbox Studio (hesap: umutt, stil: Standard).
 * Mapbox Standard import: lightPreset `dusk`, globe projeksiyon.
 * Overlay katmanlarına `slot` verilmez: Standard `top` slotu yer etiketlerinin
 * altında kalır ve uzak zoom düzeyinde kümeleri örter. Slot'suz katman stil yığınının
 * üstünde durur.
 * Token: NEXT_PUBLIC_MAPBOX_TOKEN (Directions + Styles + Standard tiles).
 */
export const MAPBOX_STYLE_URL =
  "mapbox://styles/umutt/cmsyohbh100bj01secuy6hmdo";

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Türkiye Ege bölgesi ağırlıklı veri seti için başlangıç görünümü. */
export const DEFAULT_MAP_VIEW = {
  center: [27.6, 38.4] as [number, number],
  zoom: 6.8,
};
