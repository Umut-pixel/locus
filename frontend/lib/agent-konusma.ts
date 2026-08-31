export type KonusmaRol = "user" | "assistant" | "error";

export type KonusmaOzet = {
  id: string;
  /** URL numarası — /sohbet/{slug}-{siraNo}. Bkz. sql/agent_konusma_sira_no.sql */
  siraNo: number;
  baslik: string;
  ozet: string | null;
  mesajSayisi: number;
  guncelleme: string;
  sabitlendi: boolean;
};

export type KonusmaMesaj = {
  id: string;
  sira: number;
  rol: KonusmaRol;
  metin: string;
  alinti: string | null;
  olusturulma?: string | null;
  model?: string | null;
};

export const KONUSMALAR_CHANGED = "locus-konusmalar";

export const SIDEBAR_KONUSMA_PREVIEW = 5;

export function konusmaBasligi(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Yeni konuşma";
  if (t.length <= 48) return t;
  return `${t.slice(0, 47).trimEnd()}…`;
}

/**
 * Türkçe harfler LOWERCASE'DEN ÖNCE eşlenir. JS'te `"İ".toLowerCase()`
 * birleşik noktalı `i̇` (i + U+0307) üretir ve `"ı"` zaten a-z dışındadır —
 * sıra ters olsaydı tamamı büyük harf başlıklar ("ŞUAN İÇERİDE BEKLEYEN
 * SİPARİŞLER NELER") slug'da harf kaybederdi.
 */
const TR_HARFLER: Record<string, string> = {
  "ç": "c", "Ç": "c",
  "ğ": "g", "Ğ": "g",
  "ı": "i", "I": "i", "İ": "i",
  "ö": "o", "Ö": "o",
  "ş": "s", "Ş": "s",
  "ü": "u", "Ü": "u",
};

export const SOHBET_SLUG_MAX = 60;

/** "Bu dönem en yüksek cirolu 5 müşteri kim?" + 27 -> "bu-donem-en-yuksek-cirolu-5-musteri-kim-27" */
export function konusmaSlug(baslik: string, siraNo: number): string {
  const govde = baslik
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (c) => TR_HARFLER[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SOHBET_SLUG_MAX)
    .replace(/-+$/g, "");
  return govde ? `${govde}-${siraNo}` : `sohbet-${siraNo}`;
}

export function konusmaHref(baslik: string, siraNo: number): string {
  return `/sohbet/${konusmaSlug(baslik, siraNo)}`;
}

/**
 * Slug'ın sondaki sayısı çözüm anahtarı; başındaki metin kozmetik.
 * Başlık sonradan değişse bile eski link doğru konuşmayı bulur, route
 * kanonik href'e redirect eder.
 */
export function siraNoFromSlug(slug: string): number | null {
  const m = /-(\d+)$/.exec(slug);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function konusmaOzeti(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= 280) return t;
  return `${t.slice(0, 279).trimEnd()}…`;
}

export function konusmaOzetFromRow(
  raw: Record<string, unknown>
): KonusmaOzet | null {
  const id = raw.id != null ? String(raw.id) : "";
  if (!id) return null;
  const siraNo = Number(raw.sira_no ?? 0);
  if (!Number.isSafeInteger(siraNo) || siraNo <= 0) return null;
  return {
    id,
    siraNo,
    baslik: typeof raw.baslik === "string" ? raw.baslik : "Yeni konuşma",
    ozet: typeof raw.ozet === "string" ? raw.ozet : null,
    mesajSayisi: Number(raw.mesaj_sayisi ?? 0),
    guncelleme: String(raw.guncelleme ?? ""),
    sabitlendi: Boolean(raw.sabitlendi),
  };
}

export function sortKonusmalar(items: KonusmaOzet[]): KonusmaOzet[] {
  return [...items].sort((a, b) => {
    if (a.sabitlendi !== b.sabitlendi) return a.sabitlendi ? -1 : 1;
    return b.guncelleme.localeCompare(a.guncelleme);
  });
}

export function notifyKonusmalarChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(KONUSMALAR_CHANGED));
}
