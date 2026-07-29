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
  "yas_st",
  "hf_01_06",
  "hf_07_13",
  "hf_14_20",
  "hf_21_27",
  "hf_28_34",
  "hf_35_41",
  "hf_42_48",
  "hf_49_55",
  "hf_56_62",
  "hf_63_69",
  "hf_70_ustu",
  "yas_toplam",
  "yas_riskli_tutar",
  "borc_riskli",
  "belge_donem_bas",
  "belge_donem_bit",
  "belge_satir_sayisi",
  "belge_siparis_sayisi",
  "belge_fatura_sayisi",
  "belge_net_ciro",
  "belge_brut_ciro",
  "belge_iskonto_toplam",
  "belge_promo_satir",
  "belge_iptal_satir",
  "belge_son_islem_tarihi",
  "belge_vade_gunu",
  "belge_top_urun_grup",
  "belge_son_urun_grup",
  "belge_top_urun",
  "belge_son_urun",
  "belge_st_adi",
  "belge_st_kodu",
].join(",");
