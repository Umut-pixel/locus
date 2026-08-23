export type KonusmaRol = "user" | "assistant" | "error";

export type KonusmaOzet = {
  id: string;
  baslik: string;
  ozet: string | null;
  mesajSayisi: number;
  guncelleme: string;
};

export type KonusmaMesaj = {
  id: string;
  sira: number;
  rol: KonusmaRol;
  metin: string;
  alinti: string | null;
};

export const KONUSMALAR_CHANGED = "locus-konusmalar";

export const SIDEBAR_KONUSMA_PREVIEW = 5;

export function konusmaBasligi(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Yeni konuşma";
  if (t.length <= 48) return t;
  return `${t.slice(0, 47).trimEnd()}…`;
}

export function konusmaOzeti(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= 280) return t;
  return `${t.slice(0, 279).trimEnd()}…`;
}

export function notifyKonusmalarChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(KONUSMALAR_CHANGED));
}
