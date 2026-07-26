import * as XLSX from "xlsx";

import { normalizeRows } from "./utils";

const PREFERRED_SHEETS = ["Data", "RutTanimListesi", "Sheet1"];

/**
 * Excel buffer'dan satır + başlık çıkar.
 * Tercih edilen sheet adları varsa onu kullan; yoksa ilk sheet.
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

  let sheetName = wb.SheetNames[0];
  for (const preferred of PREFERRED_SHEETS) {
    if (wb.SheetNames.includes(preferred)) {
      sheetName = preferred;
      break;
    }
  }

  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  if (!json.length) {
    // header-only veya boş — yine de header almayı dene
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    });
    const headers = ((aoa[0] as unknown[]) ?? []).map((h) =>
      String(h ?? "").trim()
    );
    return { headers, rows: [], sheetName };
  }

  const headers = Object.keys(json[0] ?? {});
  return {
    headers,
    rows: normalizeRows(json),
    sheetName,
  };
}
