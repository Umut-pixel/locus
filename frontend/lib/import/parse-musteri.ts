import { bolgeGrubu } from "./cities";
import { musteriDedup } from "./dedup-musteri";
import type { MusteriUpsertRow } from "./types";
import {
  cellStr,
  metinTemizle,
  sayiyaCevir,
  sehirNormalize,
} from "./utils";

const TR_ENLEM: [number, number] = [35.8, 42.2];
const TR_BOYLAM: [number, number] = [25.6, 45.0];

function koordinatGecerli(lat: number | null, lon: number | null): boolean {
  if (lat == null || lon == null) return false;
  if (lat === 0 || lon === 0) return false;
  return (
    lat >= TR_ENLEM[0] &&
    lat <= TR_ENLEM[1] &&
    lon >= TR_BOYLAM[0] &&
    lon <= TR_BOYLAM[1]
  );
}

export interface ParseMusteriSonuc {
  rows: MusteriUpsertRow[];
  islenenSatir: number;
  bolgeDisi: number;
  dedupUyari: boolean;
  farklilasanKolonlar: string[];
}

/**
 * MusteriListesi satırlarını kısmi upsert satırlarına çevir.
 * KoordinatX = enlem (lat), KoordinatY = boylam (lon).
 * İl filtresi yok — DistGrup'taki her geçerli kod yazılır; `bolgeDisi`
 * yalnızca çekirdek 8 il dışındaki (veya şehri boş) kayıt sayısıdır.
 */
export function parseMusteriListesi(
  rawRows: Record<string, unknown>[]
): ParseMusteriSonuc {
  const dedup = musteriDedup(rawRows);
  const rows: MusteriUpsertRow[] = [];
  let bolgeDisi = 0;

  for (const r of dedup.rows) {
    const musteri_kodu = cellStr(r, "musteri_kodu", "MusteriKodu");
    const unvan = cellStr(r, "MusteriAd", "unvan");
    if (!musteri_kodu || !unvan) continue;

    const sehir = sehirNormalize(r["Sehir"] ?? r["sehir"] ?? "");
    if (!sehir || bolgeGrubu(sehir) === "bolge_disi") bolgeDisi += 1;

    // KoordinatX = lat, KoordinatY = lon (isim yanıltıcı)
    let lat = sayiyaCevir(r["KoordinatX"]);
    let lon = sayiyaCevir(r["KoordinatY"]);
    if (!koordinatGecerli(lat, lon)) {
      lat = null;
      lon = null;
    }

    const cep = cellStr(r, "CepTelNo");
    const tel = cellStr(r, "Telefon");
    const telefon = cep || tel || null;

    const geocode_kaynak = lat != null ? "erp" : null;
    const geocode_hassasiyet = lat != null ? "saha_gps" : null;

    rows.push({
      musteri_kodu,
      unvan,
      adres: metinTemizle(r["Adres"]) || null,
      sehir: sehir || null,
      ilce: metinTemizle(r["Ilce"]) || null,
      lat,
      lon,
      telefon,
      satis_temsilcileri: metinTemizle(r["satis_temsilcileri"]) || null,
      bolge_grubu: bolgeGrubu(sehir),
      durum: metinTemizle(r["Durum"]) || null,
      posta_kodu: metinTemizle(r["PostaKodu"]) || null,
      musteri_grubu: metinTemizle(r["Musterigrup"]) || null,
      geocode_kaynak,
      geocode_hassasiyet,
    });
  }

  return {
    rows,
    islenenSatir: dedup.girdi,
    bolgeDisi,
    dedupUyari: dedup.dedupUyari,
    farklilasanKolonlar: dedup.farklilasanKolonlar,
  };
}
