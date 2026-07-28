/** Son yüklemede etkilenen (yazılan) müşterileri haritada işaretlemek için. */

const STORAGE_KEY = "petshop_highlight_codes";
/** Eski zaman-penceresi anahtarları — bir kez temizlenir. */
const LEGACY_FROM = "petshop_highlight_from";
const LEGACY_TO = "petshop_highlight_to";

function clearLegacyKeys(): void {
  try {
    sessionStorage.removeItem(LEGACY_FROM);
    sessionStorage.removeItem(LEGACY_TO);
  } catch {
    /* ignore */
  }
}

/** Yüklemede DB'ye yazılan tüm musteri_kodu listesi. */
export function setHighlightCodes(codes: string[] | null): void {
  if (typeof globalThis.window === "undefined") return;
  try {
    clearLegacyKeys();
    if (!codes?.length) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    /* private mode / quota */
  }
}

export function getHighlightCodes(): string[] | null {
  if (typeof globalThis.window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((c): c is string => typeof c === "string");
  } catch {
    return null;
  }
}

export function buildHighlightSet(
  codes: string[] | null | undefined
): Set<string> | null {
  if (!codes?.length) return null;
  return new Set(codes);
}
