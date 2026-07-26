import { cellStr, metinTemizle } from "./utils";

const ST_KOLONLARI = new Set(["STKodu", "STKod"]);

export interface DedupSonuc {
  rows: Record<string, unknown>[];
  dedupUyari: boolean;
  farklilasanKolonlar: string[];
  girdi: number;
  cikti: number;
}

function doluluk(row: Record<string, unknown>): number {
  return Object.values(row).filter((v) => v != null && String(v).trim() !== "")
    .length;
}

function musteriKodu(row: Record<string, unknown>): string {
  return cellStr(row, "MusteriKodu", "musteri_kodu");
}

/**
 * Aynı musteri_kodu gruplarında:
 * - Fark yalnızca STKodu/STKod ise ilk satır + temsilcileri birleştir
 * - Aksi halde en dolu satır + dedupUyari
 */
export function musteriDedup(rows: Record<string, unknown>[]): DedupSonuc {
  const byKod = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const kod = musteriKodu(row);
    if (!kod) continue;
    const list = byKod.get(kod) ?? [];
    list.push(row);
    byKod.set(kod, list);
  }

  const farklilasan = new Set<string>();
  for (const grup of byKod.values()) {
    if (grup.length < 2) continue;
    const keys = new Set<string>();
    for (const r of grup) {
      for (const k of Object.keys(r)) keys.add(k);
    }
    for (const kol of keys) {
      if (kol === "MusteriKodu" || kol === "musteri_kodu") continue;
      const vals = new Set(
        grup.map((r) => String(r[kol] ?? "").trim())
      );
      if (vals.size > 1) farklilasan.add(kol);
    }
  }

  const farkList = [...farklilasan].sort();
  const sadeceSt =
    farkList.length === 0 || farkList.every((k) => ST_KOLONLARI.has(k));
  const dedupUyari = farkList.length > 0 && !sadeceSt;

  const out: Record<string, unknown>[] = [];

  for (const [kod, grup] of byKod) {
    let chosen: Record<string, unknown>;
    if (dedupUyari && grup.length > 1) {
      chosen = [...grup].sort((a, b) => doluluk(b) - doluluk(a))[0];
    } else {
      chosen = grup[0];
    }

    const temsilciler = new Set<string>();
    for (const r of grup) {
      const st = metinTemizle(r["STKod"] ?? r["STKodu"] ?? "");
      if (st) temsilciler.add(st);
    }

    out.push({
      ...chosen,
      musteri_kodu: kod,
      satis_temsilcileri: [...temsilciler].sort().join(" | "),
    });
  }

  return {
    rows: out,
    dedupUyari,
    farklilasanKolonlar: farkList,
    girdi: rows.length,
    cikti: out.length,
  };
}
