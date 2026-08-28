import type { YuklemeKarsilastirma } from "@/lib/snapshot-compare";

export type DosyaTipi =
  | "MusteriListesi"
  | "RutTanimListesi"
  | "SevkiyatRaporuKup"
  | "StYaslandirma"
  | "BelgeDetayRaporu"
  /** Panorama'dan değil, fabrikadan (ARMA İlaç) 15 günde bir e-posta ile gelir. */
  | "FabrikaSktRaporu";

export interface UploadResult {
  tip: DosyaTipi;
  islenenSatir: number;
  yeniMusteri: number;
  guncellenenMusteri: number;
  geocodeBasarisiz: number;
  eslesmeyenMusteriKodlari: string[];
  dedupUyari?: boolean;
  uyarilar?: string[];
  /** Supabase yukleme_loglari.id */
  yuklemeId?: string;
  /** ISO-8601 — dosyanın sisteme işlendiği an */
  yuklenmeZamani?: string;
  /**
   * Haritada dış halka: bu yüklemede DB'ye yazılan tüm müşteri kodları
   * (yeni + güncellenen; metrik aynı kalsa bile).
   */
  etkilenenMusteriKodlari?: string[];
  dosyaAdi?: string;
  /** Sevkiyat yüklemesinde Ritim Formu portföy özeti */
  karsilastirma?: YuklemeKarsilastirma;
}

export interface MusteriUpsertRow {
  musteri_kodu: string;
  unvan: string;
  adres: string | null;
  sehir: string | null;
  ilce: string | null;
  lat: number | null;
  lon: number | null;
  telefon: string | null;
  satis_temsilcileri: string | null;
  bolge_grubu: string | null;
  durum: string | null;
  posta_kodu: string | null;
  musteri_grubu: string | null;
  geocode_kaynak: string | null;
  geocode_hassasiyet: string | null;
}

export interface RutUpdateRow {
  musteri_kodu: string;
  rut_kod: string | null;
  rut_aciklama: string | null;
  ziyaret_sira: number | null;
}

export interface SevkiyatUpdateRow {
  musteri_kodu: string;
  son_teslimat_tarihi: string | null;
  ilk_teslimat_tarihi: string | null;
  toplam_teslimat_sayisi: number;
  toplam_agirlik: number;
  toplam_tutar: number;
  son_teslimattan_gecen_gun: number | null;
}

/** ST Yaşlandırma — müşteri bazlı borç gecikme kovaları. */
export interface YaslandirmaUpdateRow {
  musteri_kodu: string;
  /** Excel'deki müşteri adı — unvan çapraz kontrolü için */
  unvan: string;
  st: string | null;
  hf_01_06: number;
  hf_07_13: number;
  hf_14_20: number;
  hf_21_27: number;
  hf_28_34: number;
  hf_35_41: number;
  hf_42_48: number;
  hf_49_55: number;
  hf_56_62: number;
  hf_63_69: number;
  hf_70_ustu: number;
  toplam: number;
  riskli_tutar: number;
  borc_riskli: boolean;
}

/**
 * Fabrika alış raporu — ürün SKT / parti kaydı.
 * Grain: bir alım kalemi × bir SKT hücresi (bkz. sql/urun_skt_sema.sql).
 */
export interface UrunSktUpdateRow {
  /** Parse sırasında null; katalog eşleştirmesinden sonra API route dolduruyor. */
  urun_kodu: string | null;
  urun_adi: string;
  matbu_no: string | null;
  islem_tarihi: string | null;
  /** Alım KALEMİNİN toplam miktarı — çok partili kalemlerde partiye bölünemez. */
  satir_miktar: number | null;
  parti_no: string | null;
  skt_tarihi: string | null;
  durum: "tarihli" | "cozulemedi" | "devir" | "kayit_yok";
  tek_parti: boolean;
}

/** BelgeDetayRaporu — müşteri bazlı ticari dönem özeti. */
export interface BelgeOzetUpdateRow {
  musteri_kodu: string;
  donem_bas: string | null;
  donem_bit: string | null;
  satir_sayisi: number;
  siparis_sayisi: number;
  fatura_sayisi: number;
  net_ciro: number;
  brut_ciro: number;
  iskonto_toplam: number;
  promo_satir: number;
  iptal_satir: number;
  son_islem_tarihi: string | null;
  vade_gunu: number | null;
  /** Satır sayısına göre en sık UrunGrup */
  top_urun_grup: string | null;
  /** En son IslemTarihi satırındaki UrunGrup */
  son_urun_grup: string | null;
  /** Satır sayısına göre en sık Urun */
  top_urun: string | null;
  /** En son IslemTarihi satırındaki Urun */
  son_urun: string | null;
  st_adi: string | null;
  st_kodu: string | null;
}

/** TahsilatRaporu (5230) — müşteri bazlı nakit özeti. Ciro değil. */
export interface TahsilatOzetUpdateRow {
  musteri_kodu: string;
  son_tahsilat_tarihi: string | null;
  tahsilat_7g: number;
  tahsilat_30g: number;
  tahsilat_ytd: number;
  odenmemis_tutar: number;
  odenmemis_adet: number;
  satir_sayisi: number;
}
