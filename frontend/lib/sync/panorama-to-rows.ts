/**
 * Panorama landing (snake_case text) → Excel parser'ların beklediği
 * ara satır şekli. Mevcut parseMusteriListesi / parseRut / parseSevkiyat
 * aynen kullanılır.
 */

/** 5020 → MusteriListesi kolon adları */
export function panoramaMusteriToExcelRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((r) => ({
    musteri_kodu: r.musteri_kodu,
    MusteriKodu: r.musteri_kodu,
    MusteriAd: r.musteri_ad ?? r.musteri_kisa_ad,
    Adres: r.adres,
    Sehir: r.sehir,
    Ilce: r.ilce,
    KoordinatX: r.koordinat_x,
    KoordinatY: r.koordinat_y,
    CepTelNo: r.cep_tel_no,
    Telefon: r.telefon,
    Durum: r.durum,
    PostaKodu: r.posta_kodu,
    Musterigrup: r.musteri_grup,
    // Dedup ST birleştirme — isim tercih (st_kod), yoksa kod
    STKod: r.st_kod ?? r.st_kodu,
    STKodu: r.st_kodu ?? r.st_kod,
  }));
}

/** 5500 → RutTanimListesi kolon adları */
export function panoramaRutToExcelRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((r) => ({
    MusteriKod: r.musteri_kod ?? r.musteri_kodu,
    MusteriKodu: r.musteri_kod ?? r.musteri_kodu,
    RutKod: r.rut_kod,
    RutAciklama: r.rut_aciklama,
    ZiyaretSira: r.ziyaret_sira,
  }));
}

/** 5130 → SevkiyatRaporuKup kolon adları (ağırlık gram, tarih DD.MM.YYYY) */
export function panoramaSevkiyatToExcelRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((r) => ({
    MusteriKodu: r.musteri_kodu,
    musteri_kodu: r.musteri_kodu,
    BelgeTarihi: r.belge_tarihi,
    NetFiyat: r.net_fiyat,
    Agirlik: r.agirlik,
    Plaka: r.plaka,
  }));
}
