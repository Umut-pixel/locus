/** Boşluk normalize; yalnızca noktalama ise boşalt. */
export function metinTemizle(value: unknown): string {
  if (value == null) return "";
  let s = String(value).replace(/\s+/g, " ").trim();
  if (/^[.\-_,;:*]+$/.test(s)) s = "";
  return s.replace(/^[\s.,\-]+|[\s.,\-]+$/g, "");
}

/** Türkçe i/I düzeltmesi + büyük harf. */
export function sehirNormalize(value: unknown): string {
  let s = metinTemizle(value);
  s = s.replace(/i/g, "İ").replace(/ı/g, "I");
  return s.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}

/** Virgüllü ondalık / binlik ayraçlı metni sayıya çevir. */
export function sayiyaCevir(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  let s = String(value).trim().replace(/\s/g, "");
  if (!s) return null;
  const virgullu = s.includes(",") && s.includes(".");
  if (virgullu) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function cellStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (key in row && row[key] != null && String(row[key]).trim() !== "") {
      return metinTemizle(row[key]);
    }
  }
  return "";
}

export function headerSet(headers: string[]): Set<string> {
  return new Set(headers.map((h) => String(h ?? "").trim()).filter(Boolean));
}

/** SheetJS satırlarını düz Record[] olarak al; boş satırları at. */
export function normalizeRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.filter((row) =>
    Object.values(row).some((v) => v != null && String(v).trim() !== "")
  );
}
