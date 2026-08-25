export type KonusmaRol = "user" | "assistant" | "error";

export type KonusmaOzet = {
  id: string;
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
  return {
    id,
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
