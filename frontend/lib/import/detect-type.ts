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
 * Kolon başlıklarından dosya tipini tespit et.
 * KoordinatX → MusteriListesi
 * RutKod → RutTanimListesi
 * BelgeTarihi + Plaka → SevkiyatRaporuKup
 * Müşteri Kodu + 70 Üstü / hafta bantları → StYaslandirma
 * BelgeTip + Nettutar + (UrunKodu | SiparisNo) → BelgeDetayRaporu
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

  throw new DosyaTipiHatasi(
    "Dosya tipi tanınamadı. MusteriListesi (KoordinatX), RutTanimListesi (RutKod), SevkiyatRaporuKup (BelgeTarihi + Plaka), ST Yaşlandırma (Müşteri Kodu + hafta bantları) veya BelgeDetayRaporu (BelgeTip + Nettutar) bekleniyor."
  );
}
