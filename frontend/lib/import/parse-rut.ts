import type { RutUpdateRow } from "./types";
import { cellStr, metinTemizle, sayiyaCevir } from "./utils";

export interface ParseRutSonuc {
  rows: RutUpdateRow[];
  islenenSatir: number;
}

/**
 * RutTanimListesi → rut alanları. Aynı musteri_kodu için en düşük ZiyaretSira.
 */
export function parseRutTanimListesi(
  rawRows: Record<string, unknown>[]
): ParseRutSonuc {
  const byKod = new Map<string, RutUpdateRow>();

  for (const r of rawRows) {
    const musteri_kodu = cellStr(r, "MusteriKod", "MusteriKodu", "musteri_kodu");
    if (!musteri_kodu) continue;

    const ziyaret_sira = sayiyaCevir(r["ZiyaretSira"]);
    const sira =
      ziyaret_sira != null && Number.isFinite(ziyaret_sira)
        ? Math.round(ziyaret_sira)
        : null;

    const candidate: RutUpdateRow = {
      musteri_kodu,
      rut_kod: metinTemizle(r["RutKod"]) || null,
      rut_aciklama: metinTemizle(r["RutAciklama"]) || null,
      ziyaret_sira: sira,
    };

    const prev = byKod.get(musteri_kodu);
    if (!prev) {
      byKod.set(musteri_kodu, candidate);
      continue;
    }
    const prevSira = prev.ziyaret_sira ?? Number.POSITIVE_INFINITY;
    const nextSira = candidate.ziyaret_sira ?? Number.POSITIVE_INFINITY;
    if (nextSira < prevSira) byKod.set(musteri_kodu, candidate);
  }

  return {
    rows: [...byKod.values()],
    islenenSatir: rawRows.length,
  };
}
