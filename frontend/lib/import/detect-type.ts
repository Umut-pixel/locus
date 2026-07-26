import type { DosyaTipi } from "./types";
import { headerSet } from "./utils";

export class DosyaTipiHatasi extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DosyaTipiHatasi";
  }
}

/**
 * Kolon başlıklarından dosya tipini tespit et.
 * KoordinatX → MusteriListesi
 * RutKod → RutTanimListesi
 * BelgeTarihi + Plaka → SevkiyatRaporuKup
 */
export function detectDosyaTipi(headers: string[]): DosyaTipi {
  const cols = headerSet(headers);

  if (cols.has("KoordinatX")) return "MusteriListesi";
  if (cols.has("RutKod")) return "RutTanimListesi";
  if (cols.has("BelgeTarihi") && cols.has("Plaka")) return "SevkiyatRaporuKup";

  throw new DosyaTipiHatasi(
    "Dosya tipi tanınamadı. MusteriListesi (KoordinatX), RutTanimListesi (RutKod) veya SevkiyatRaporuKup (BelgeTarihi + Plaka) bekleniyor."
  );
}
