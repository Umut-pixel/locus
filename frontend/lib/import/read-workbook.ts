import * as XLSX from "xlsx";

import { normalizeRows } from "./utils";

const PREFERRED_SHEETS = ["Data", "RutTanimListesi", "Sheet1"];

function rowCells(row: unknown[]): string[] {
  return row.map((h) => String(h ?? "").trim());
}

function looksLikeYaslandirmaHeaders(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()).filter(Boolean));
  const hasKod =
    set.has("Müşteri Kodu") ||
    set.has("Musteri Kodu") ||
    [...set].some((h) => h.toLocaleLowerCase("tr-TR") === "müşteri kodu");
  const hasRisk =
    set.has("70 Üstü") ||
    [...set].some((h) => /70\s*üst/i.test(h));
  const hasWeek = [...set].some((h) => /^\d{2}\s*-\s*\d{2}$/.test(h.trim()));
  return hasKod && (hasRisk || hasWeek);
}

function looksLikeStandardHeaders(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()).filter(Boolean));
  return (
    set.has("KoordinatX") ||
    set.has("RutKod") ||
    (set.has("BelgeTarihi") && set.has("Plaka"))
  );
}

/**
 * Sheet AOA içinde header satırını bul (ST Yaşlandırma: satır 1 = Hafta, satır 2 = kolonlar).
 * Bulunamazsa 0 döner.
 */
function findHeaderRowIndex(aoa: unknown[][]): number {
  const limit = Math.min(aoa.length, 15);
  for (let i = 0; i < limit; i++) {
    const headers = rowCells((aoa[i] ?? []) as unknown[]);
    if (looksLikeYaslandirmaHeaders(headers) || looksLikeStandardHeaders(headers)) {
      return i;
    }
  }
  return 0;
}

function scoreSheet(sheet: XLSX.WorkSheet): {
  score: number;
  headerRow: number;
  headers: string[];
} {
  const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  if (!aoa.length) return { score: 0, headerRow: 0, headers: [] };

  const headerRow = findHeaderRowIndex(aoa as unknown[][]);
  const headers = rowCells((aoa[headerRow] ?? []) as unknown[]);

  let score = 0;
  if (looksLikeYaslandirmaHeaders(headers)) score += 100;
  if (looksLikeStandardHeaders(headers)) score += 80;
  if (PREFERRED_SHEETS.includes("")) score += 0;
  // Detay sayfası genelde daha çok satır
  score += Math.min((aoa.length - headerRow - 1) / 10, 20);
  return { score, headerRow, headers };
}

/**
 * Excel buffer'dan satır + başlık çıkar.
 * ST Yaşlandırma: doğru sheet + header satırı (Hafta satırını atla), raw sayılar.
 * Diğer tipler: tercih edilen sheet adları veya en yüksek skorlu sayfa.
 */
export function readWorkbook(buffer: ArrayBuffer): {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
} {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  if (!wb.SheetNames.length) {
    throw new Error("Excel dosyasında sayfa bulunamadı.");
  }

  let bestName = wb.SheetNames[0];
  let best = scoreSheet(wb.Sheets[bestName]);

  for (const name of wb.SheetNames) {
    if (PREFERRED_SHEETS.includes(name)) {
      const scored = scoreSheet(wb.Sheets[name]);
      if (scored.score >= best.score) {
        bestName = name;
        best = scored;
      }
    }
  }

  // Tüm sayfaları tara — yaşlandırma detayı "Sheet" gibi genel isimlerde olabilir
  for (const name of wb.SheetNames) {
    const scored = scoreSheet(wb.Sheets[name]);
    if (scored.score > best.score) {
      bestName = name;
      best = scored;
    }
  }

  const sheet = wb.Sheets[bestName];
  const headerRow = best.headerRow;
  const useRaw = looksLikeYaslandirmaHeaders(best.headers);

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: useRaw,
    range: headerRow,
  });

  if (!json.length) {
    return {
      headers: best.headers.filter(Boolean),
      rows: [],
      sheetName: bestName,
    };
  }

  const headers = Object.keys(json[0] ?? {}).map((h) => String(h).trim());
  return {
    headers,
    rows: normalizeRows(json),
    sheetName: bestName,
  };
}
