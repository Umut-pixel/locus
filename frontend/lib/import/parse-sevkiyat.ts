import type { SevkiyatUpdateRow } from "./types";
import { cellStr, sayiyaCevir } from "./utils";

const AGIRLIK_BOLEN = 1000;

/** BelgeTarihi: dd.mm.yyyy → Date | null */
export function parseBelgeTarihi(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (SheetJS bazen sayı verir)
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + value * 86400000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value ?? "").trim();
  if (!s) return null;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86400000);
}

interface Acc {
  son: Date | null;
  ilk: Date | null;
  sayi: number;
  agirlik: number;
  tutar: number;
}

export interface ParseSevkiyatSonuc {
  rows: SevkiyatUpdateRow[];
  islenenSatir: number;
  tarihBozuk: number;
}

/**
 * SevkiyatRaporuKup → müşteri bazlı aggregate (dosyaya göre tamamen yeniden hesap).
 */
export function parseSevkiyatRaporuKup(
  rawRows: Record<string, unknown>[]
): ParseSevkiyatSonuc {
  const byKod = new Map<string, Acc>();
  let tarihBozuk = 0;
  let referans: Date | null = null;

  for (const r of rawRows) {
    const musteri_kodu = cellStr(r, "MusteriKodu", "musteri_kodu");
    if (!musteri_kodu) continue;

    const tarih = parseBelgeTarihi(r["BelgeTarihi"]);
    if (!tarih) {
      tarihBozuk += 1;
      continue;
    }
    if (!referans || tarih > referans) referans = tarih;

    const tutar = sayiyaCevir(r["NetFiyat"]) ?? 0;
    const agirlikGram = sayiyaCevir(r["Agirlik"]) ?? 0;
    const agirlikKg = agirlikGram / AGIRLIK_BOLEN;

    const acc = byKod.get(musteri_kodu) ?? {
      son: null,
      ilk: null,
      sayi: 0,
      agirlik: 0,
      tutar: 0,
    };
    acc.sayi += 1;
    acc.agirlik += agirlikKg;
    acc.tutar += tutar;
    if (!acc.son || tarih > acc.son) acc.son = tarih;
    if (!acc.ilk || tarih < acc.ilk) acc.ilk = tarih;
    byKod.set(musteri_kodu, acc);
  }

  const rows: SevkiyatUpdateRow[] = [];
  for (const [musteri_kodu, acc] of byKod) {
    const son = acc.son;
    rows.push({
      musteri_kodu,
      son_teslimat_tarihi: son ? toIsoDate(son) : null,
      ilk_teslimat_tarihi: acc.ilk ? toIsoDate(acc.ilk) : null,
      toplam_teslimat_sayisi: acc.sayi,
      toplam_agirlik: Math.round(acc.agirlik * 100) / 100,
      toplam_tutar: Math.round(acc.tutar * 100) / 100,
      son_teslimattan_gecen_gun:
        referans && son ? daysBetween(referans, son) : null,
    });
  }

  return {
    rows,
    islenenSatir: rawRows.length,
    tarihBozuk,
  };
}
