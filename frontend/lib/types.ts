export type RiskDurumu = "saglikli" | "izlenmeli" | "riskli" | "hic_teslimat_yok";

export type GeocodeHassasiyet = "saha_gps" | "mahalle_merkezi" | "ilce_merkezi";

/** `public.musteriler_harita` view satırı (bkz. sema.sql). */
export interface MusteriHarita {
  musteri_kodu: string;
  unvan: string;
  adres?: string | null;
  sehir: string | null;
  ilce: string | null;
  lat: number;
  lon: number;
  rut_kod: string | null;
  rut_aciklama: string | null;
  ziyaret_sira: number | null;
  son_teslimat_tarihi: string | null;
  ilk_teslimat_tarihi: string | null;
  toplam_teslimat_sayisi: number;
  toplam_agirlik: number;
  toplam_tutar: number;
  son_teslimattan_gecen_gun: number | null;
  durum: string | null;
  geocode_hassasiyet: GeocodeHassasiyet | null;
  risk_durumu: RiskDurumu;
  /** ISO timestamptz — satırın son güncellenme anı */
  guncellendi?: string | null;
  /**
   * Son yüklemede etkilenen kayıt mı (0/1). Yeni + güncellenen;
   * metrik aynı kalsa bile. Haritada dış halka filtresi.
   */
  son_yuklemede_guncellendi?: 0 | 1;
  /** ST Yaşlandırma (LEFT JOIN) — yoksa null */
  yas_st?: string | null;
  hf_01_06?: number | null;
  hf_07_13?: number | null;
  hf_14_20?: number | null;
  hf_21_27?: number | null;
  hf_28_34?: number | null;
  hf_35_41?: number | null;
  hf_42_48?: number | null;
  hf_49_55?: number | null;
  hf_56_62?: number | null;
  hf_63_69?: number | null;
  hf_70_ustu?: number | null;
  yas_toplam?: number | null;
  yas_riskli_tutar?: number | null;
  borc_riskli?: boolean | null;
  /** BelgeDetayRaporu (LEFT JOIN) — yoksa null */
  belge_donem_bas?: string | null;
  belge_donem_bit?: string | null;
  belge_satir_sayisi?: number | null;
  belge_siparis_sayisi?: number | null;
  belge_fatura_sayisi?: number | null;
  belge_net_ciro?: number | null;
  belge_brut_ciro?: number | null;
  belge_iskonto_toplam?: number | null;
  belge_promo_satir?: number | null;
  belge_iptal_satir?: number | null;
  belge_son_islem_tarihi?: string | null;
  belge_vade_gunu?: number | null;
  belge_top_urun_grup?: string | null;
  belge_son_urun_grup?: string | null;
  belge_top_urun?: string | null;
  belge_son_urun?: string | null;
  belge_st_adi?: string | null;
  belge_st_kodu?: string | null;
}
