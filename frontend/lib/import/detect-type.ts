import type { DosyaTipi } from "./types";
import { headerSet } from "./utils";

export class DosyaTipiHatasi extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DosyaTipiHatasi";
  }
}

function hasYaslandirmaHeaders(cols: Set<string>): boolean {
  const hasKod =
    cols.has("Müşteri Kodu") ||
    cols.has("Musteri Kodu") ||
    [...cols].some((h) => h.toLocaleLowerCase("tr-TR") === "müşteri kodu");
  const has70 =
    cols.has("70 Üstü") ||
    [...cols].some((h) => /70\s*üst/i.test(h));
  const hasWeek = [...cols].some((h) => /^\d{2}\s*-\s*\d{2}$/.test(h.trim()));
  const hasToplam = cols.has("Toplam");
  return hasKod && (has70 || (hasWeek && hasToplam));
}

/**
 * Fabrika (ARMA İlaç) alış raporu — Panorama'dan gelmez.
 *
 * İmza: "SKT" ile başlayan en az bir kolon + "Ürün". Panorama'nın hiçbir
 * raporunda SKT kolonu yok; ayrıca bu dosya boşluklu Türkçe başlık kullanıyor
 * ("Belge Tip", "Matbu No") — Panorama'nın camelCase'iyle ("BelgeTip") aynı
 * anda eşleşme ihtimali yok. 2026-08-21'de canlı dosyayla doğrulandı: mevcut
 * 5 tipin hiçbirinin kuralına takılmıyor.
 */
function hasFabrikaSktHeaders(cols: Set<string>): boolean {
  const hasSkt = [...cols].some((h) =>
    h.replace(/İ/g, "I").toLocaleUpperCase("tr-TR").startsWith("SKT")
  );
  const hasUrun = cols.has("Ürün") || cols.has("Urun");
  return hasSkt && hasUrun;
}

/**
 * Depo fiziksel sayım föyü ("PATİGO DEPO SKT BİLGİSİ") — Panorama'dan gelmez,
 * depoda elle tutulup e-posta ile gelir.
 *
 * İmza: "DEPO STOK" + en az bir "SAYIM*" + en az bir "SKT*". Fabrika alış
 * raporundan ÖNCE denenmeli: o dosyanın imzası yalnızca (SKT* + Ürün) ve bu
 * föy de onu taşıyor. 2026-09-06'da canlıda tam olarak bu oldu — föy fabrika
 * parser'ına düştü, DEPO STOK ile 3 SAYIM kolonu sessizce çöpe gitti,
 * `islem_tarihi` boş kaldığı için stok sayfasındaki SKT kapsam rozeti de
 * görünmez oldu.
 */
function hasDepoSktSayimHeaders(cols: Set<string>): boolean {
  const buyuk = [...cols].map((h) =>
    h.replace(/İ/g, "I").toLocaleUpperCase("tr-TR").trim()
  );
  const hasDepoStok = buyuk.some((h) => h.replace(/\s+/g, " ") === "DEPO STOK");
  const hasSayim = buyuk.some((h) => h.startsWith("SAYIM"));
  const hasSkt = buyuk.some((h) => h.startsWith("SKT"));
  return hasDepoStok && hasSayim && hasSkt;
}

/**
 * Kolon başlıklarından dosya tipini tespit et.
 * KoordinatX → MusteriListesi
 * RutKod → RutTanimListesi
 * BelgeTarihi + Plaka → SevkiyatRaporuKup
 * Müşteri Kodu + 70 Üstü / gün bantları → StYaslandirma
 * BelgeTip + Nettutar + (UrunKodu | SiparisNo) → BelgeDetayRaporu
 * DEPO STOK + SAYIM* + SKT* → DepoSktSayimRaporu (fabrikadan ÖNCE bakılır)
 * SKT* + Ürün → FabrikaSktRaporu
 */
export function detectDosyaTipi(headers: string[]): DosyaTipi {
  const cols = headerSet(headers);

  if (cols.has("KoordinatX")) return "MusteriListesi";
  if (cols.has("RutKod")) return "RutTanimListesi";
  if (cols.has("BelgeTarihi") && cols.has("Plaka")) return "SevkiyatRaporuKup";
  if (hasYaslandirmaHeaders(cols)) return "StYaslandirma";
  if (
    cols.has("BelgeTip") &&
    cols.has("Nettutar") &&
    (cols.has("UrunKodu") || cols.has("SiparisNo"))
  ) {
    return "BelgeDetayRaporu";
  }
  // Depo sayım föyü fabrika imzasını da taşıyor — sıralama önemli.
  if (hasDepoSktSayimHeaders(cols)) return "DepoSktSayimRaporu";
  if (hasFabrikaSktHeaders(cols)) return "FabrikaSktRaporu";

  throw new DosyaTipiHatasi(
    "Dosya tipi tanınamadı. MusteriListesi (KoordinatX), RutTanimListesi (RutKod), SevkiyatRaporuKup (BelgeTarihi + Plaka), ST Yaşlandırma (Müşteri Kodu + gün bantları), BelgeDetayRaporu (BelgeTip + Nettutar), Depo SKT sayım föyü (DEPO STOK + SAYIM + SKT) veya Fabrika SKT raporu (SKT + Ürün) bekleniyor."
  );
}
