export type DosyaTipi =
  | "MusteriListesi"
  | "RutTanimListesi"
  | "SevkiyatRaporuKup";

export interface UploadResult {
  tip: DosyaTipi;
  islenenSatir: number;
  yeniMusteri: number;
  guncellenenMusteri: number;
  geocodeBasarisiz: number;
  eslesmeyenMusteriKodlari: string[];
  dedupUyari?: boolean;
  uyarilar?: string[];
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
