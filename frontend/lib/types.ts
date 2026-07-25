export type RiskDurumu = "saglikli" | "izlenmeli" | "riskli" | "hic_teslimat_yok";

export type GeocodeHassasiyet = "saha_gps" | "mahalle_merkezi" | "ilce_merkezi";

/** `public.musteriler_harita` view satırı (bkz. sema.sql). */
export interface MusteriHarita {
  musteri_kodu: string;
  unvan: string;
  sehir: string | null;
  ilce: string | null;
  lat: number;
  lon: number;
  rut_kod: string | null;
  rut_aciklama: string | null;
  ziyaret_sira: number | null;
  son_teslimat_tarihi: string | null;
  toplam_teslimat_sayisi: number;
  toplam_agirlik: number;
  toplam_tutar: number;
  son_teslimattan_gecen_gun: number | null;
  durum: string | null;
  geocode_hassasiyet: GeocodeHassasiyet | null;
  risk_durumu: RiskDurumu;
}
