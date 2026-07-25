/**
 * Mapbox Studio "Outdoors" özel stili (hesap: umutt).
 * Stilin sources/sprite/glyphs alanları mapbox:// şemasıyla barındırılıyor,
 * bu yüzden style.json'u projeye kopyalamaya gerek yok — sadece style URL'i
 * ve geçerli bir Mapbox public access token yeterli.
 */
export const MAPBOX_STYLE_URL =
  "mapbox://styles/umutt/cmqpjeid3001m01s67kbq1804";

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Türkiye Ege bölgesi ağırlıklı veri seti için başlangıç görünümü. */
export const DEFAULT_MAP_VIEW = {
  center: [27.6, 38.4] as [number, number],
  zoom: 6.8,
};
