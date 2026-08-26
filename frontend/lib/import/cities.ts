import { sehirNormalize } from "./utils";

/**
 * Çekirdek / sınır etiketleri — dahil etme kapısı değil.
 * DistGrup'taki her müşteri `musteriler`'e yazılır; bu setler yalnızca
 * `bolge_grubu` kolonunu (`cekirdek` | `sinir_dahil` | `bolge_disi`) doldurur.
 */
export const SEHIR_CEKIRDEK = new Set([
  "İZMİR",
  "MANİSA",
  "AYDIN",
  "MUĞLA",
  "DENİZLİ",
]);

export const SEHIR_SINIR_DAHIL = new Set([
  "BALIKESİR",
  "ÇANAKKALE",
  "UŞAK",
]);

export const SEHIR_HEDEF = new Set([...SEHIR_CEKIRDEK, ...SEHIR_SINIR_DAHIL]);

/** İl merkezleri — lat, lon (harita kamerası / geocode sapma kontrolü). */
export const SEHIR_MERKEZ: Record<string, [number, number]> = {
  İZMİR: [38.4237, 27.1428],
  MANİSA: [38.6191, 27.4289],
  AYDIN: [37.856, 27.8416],
  MUĞLA: [37.2153, 28.3636],
  DENİZLİ: [37.7765, 29.0864],
  BALIKESİR: [39.6484, 27.8826],
  ÇANAKKALE: [40.1553, 26.4142],
  UŞAK: [38.6823, 29.4082],
};

export type BolgeGrubu = "cekirdek" | "sinir_dahil" | "bolge_disi";

export function bolgeGrubu(sehir: string): BolgeGrubu {
  const n = sehirNormalize(sehir);
  if (SEHIR_CEKIRDEK.has(n)) return "cekirdek";
  if (SEHIR_SINIR_DAHIL.has(n)) return "sinir_dahil";
  return "bolge_disi";
}

/** @deprecated Kapsam artık DistGrup'un tamamı — dahil etme kapısı değil, etiket. */
export function hedefBolgeMi(sehir: string): boolean {
  return Boolean(sehirNormalize(sehir));
}

/** Mapbox fitBounds: [[minLon, minLat], [maxLon, maxLat]]. */
export type LngLatBoundsTuple = [[number, number], [number, number]];

/**
 * Şehir müşteri noktalarına göre kamera kutusu.
 * Nokta yoksa il merkezi etrafında varsayılan kutu.
 */
export function boundsForSehir(
  rows: ReadonlyArray<{ sehir: string | null; lat: number; lon: number }>,
  city: string
): LngLatBoundsTuple | null {
  const pts = rows.filter((r) => r.sehir === city);
  if (pts.length > 0) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const p of pts) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
    // Tek nokta / çok dar küme — okunur zoom için pad
    const padLat = Math.max(0.08, (maxLat - minLat) * 0.15);
    const padLon = Math.max(0.1, (maxLon - minLon) * 0.15);
    return [
      [minLon - padLon, minLat - padLat],
      [maxLon + padLon, maxLat + padLat],
    ];
  }

  const merkez = SEHIR_MERKEZ[sehirNormalize(city)];
  if (!merkez) return null;
  const [lat, lon] = merkez;
  const d = 0.38;
  return [
    [lon - d, lat - d],
    [lon + d, lat + d],
  ];
}
