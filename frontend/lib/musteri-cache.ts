import type { MusteriHarita } from "./types";

/** Modül seviyesi bellek cache — remount / refresh'te boş ekranı önler. */
let cachedRows: MusteriHarita[] | null = null;
let cachedAt = 0;

const TTL_MS = 5 * 60 * 1000;

export function getMusteriCache(): MusteriHarita[] | null {
  if (!cachedRows) return null;
  if (Date.now() - cachedAt > TTL_MS) return cachedRows; // stale-while-revalidate: yine de döndür
  return cachedRows;
}

export function isMusteriCacheFresh(): boolean {
  return Boolean(cachedRows && Date.now() - cachedAt <= TTL_MS);
}

export function setMusteriCache(rows: MusteriHarita[]): void {
  cachedRows = rows;
  cachedAt = Date.now();
}

export function clearMusteriCache(): void {
  cachedRows = null;
  cachedAt = 0;
}

/** View'dan çekilen kolonlar — gereksiz payload yok. */
export const MUSTERI_HARITA_SELECT = [
  "musteri_kodu",
  "unvan",
  "sehir",
  "ilce",
  "lat",
  "lon",
  "rut_kod",
  "rut_aciklama",
  "ziyaret_sira",
  "son_teslimat_tarihi",
  "ilk_teslimat_tarihi",
  "toplam_teslimat_sayisi",
  "toplam_agirlik",
  "toplam_tutar",
  "son_teslimattan_gecen_gun",
  "durum",
  "geocode_hassasiyet",
  "risk_durumu",
  "guncellendi",
].join(",");
