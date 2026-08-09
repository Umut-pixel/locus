import {
  AlertOctagonIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  type LucideIcon,
} from "lucide-react";

import type { RiskDurumu } from "./types";

/** Risk pill ikonu — renk/etiket zaten lib/risk-style.ts'te (RISK_COLORS/RISK_SHORT_LABELS), tekrar tanımlama. */
export const RISK_ICONS: Record<RiskDurumu, LucideIcon> = {
  saglikli: CheckCircle2Icon,
  izlenmeli: AlertTriangleIcon,
  riskli: AlertOctagonIcon,
  hic_teslimat_yok: ClockIcon,
};

export interface TagPalette {
  bg: string;
  text: string;
  border: string;
}

const NEUTRAL_PALETTE: TagPalette = {
  bg: "rgba(148,163,184,0.12)",
  text: "#94a3b8",
  border: "rgba(148,163,184,0.28)",
};

/**
 * musteriler_harita.musteri_grubu — Panorama Musterigrup kodu, "NNN - AD" formatında.
 * 2026-08-10 itibariyle canlı DB'de gözlenen 7 değer (execute_sql ile doğrulandı).
 * Yeni bir kod eklenirse HASH_FALLBACK_PALETTE devreye girer, uygulama kırılmaz.
 */
const SEGMENT_PALETTE: Record<string, TagPalette> = {
  "200": { bg: "rgba(96,165,250,0.14)", text: "#60a5fa", border: "rgba(96,165,250,0.32)" }, // VETERİNER
  "201": { bg: "rgba(167,139,250,0.14)", text: "#a78bfa", border: "rgba(167,139,250,0.32)" }, // PETSHOP
  "202": { bg: "rgba(251,191,36,0.14)", text: "#fbbf24", border: "rgba(251,191,36,0.32)" }, // YEM TOPTAN
  "203": { bg: "rgba(45,212,191,0.14)", text: "#2dd4bf", border: "rgba(45,212,191,0.32)" }, // ÇİFTLİK/BARINAK
  "204": { bg: "rgba(244,114,182,0.14)", text: "#f472b6", border: "rgba(244,114,182,0.32)" }, // ULUSAL KANAL
  "205": { bg: "rgba(148,163,184,0.14)", text: "#cbd5e1", border: "rgba(148,163,184,0.32)" }, // GELENEKSEL KANAL
  "206": { bg: "rgba(52,211,153,0.14)", text: "#34d399", border: "rgba(52,211,153,0.32)" }, // E-TİCARET
};

/** Segment filtre dropdown'u — execute_sql ile doğrulanan 7 canlı değer, kod sırasına göre. */
export const SEGMENT_OPTIONS: string[] = [
  "200 - VETERİNER",
  "201 - PETSHOP",
  "202 - YEM TOPTAN",
  "203 - ÇİFTLİK/BARINAK",
  "204 - ULUSAL KANAL",
  "205 - GELENEKSEL KANAL",
  "206 - E-TİCARET",
];

/** Bilinmeyen segment kodları için deterministik (rastgele değil) renk havuzu. */
const HASH_FALLBACK_PALETTE: TagPalette[] = [
  { bg: "rgba(251,146,60,0.14)", text: "#fb923c", border: "rgba(251,146,60,0.32)" },
  { bg: "rgba(129,140,248,0.14)", text: "#818cf8", border: "rgba(129,140,248,0.32)" },
  { bg: "rgba(74,222,128,0.14)", text: "#4ade80", border: "rgba(74,222,128,0.32)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function segmentPalette(musteriGrubu: string | null | undefined): TagPalette {
  if (!musteriGrubu) return NEUTRAL_PALETTE;
  const code = musteriGrubu.trim().slice(0, 3);
  const known = SEGMENT_PALETTE[code];
  if (known) return known;
  return HASH_FALLBACK_PALETTE[hashString(musteriGrubu) % HASH_FALLBACK_PALETTE.length];
}

/** "201 - PETSHOP" → "Petshop" — pill için okunur kısa etiket, filtrede/veride ham değer korunur. */
export function segmentDisplayLabel(musteriGrubu: string | null | undefined): string {
  if (!musteriGrubu) return "—";
  const dashIndex = musteriGrubu.indexOf(" - ");
  const raw = dashIndex >= 0 ? musteriGrubu.slice(dashIndex + 3) : musteriGrubu;
  return raw
    .toLocaleLowerCase("tr-TR")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1) : w))
    .join(" ");
}

/** musteriler_harita.durum — musteri_ek_grup canlı şemada yok; ikinci pil olarak en yakın gerçek alan. */
const DURUM_PALETTE: Record<string, TagPalette> = {
  AKTIF: { bg: "rgba(74,222,128,0.12)", text: "#4ade80", border: "rgba(74,222,128,0.28)" },
  PASIF: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", border: "rgba(148,163,184,0.28)" },
  IPTAL: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", border: "rgba(239,68,68,0.28)" },
};

function durumKey(durum: string): string {
  return durum
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S");
}

export function durumPalette(durum: string | null | undefined): TagPalette {
  if (!durum) return NEUTRAL_PALETTE;
  return DURUM_PALETTE[durumKey(durum)] ?? NEUTRAL_PALETTE;
}

/** Temsilci baş harfi avatarı — sabit doygunluk/parlaklık, hue isimden deterministik. */
export function avatarBackgroundFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 42%, 30%)`;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase("tr-TR");
  return (parts[0]![0] + parts[1]![0]).toLocaleUpperCase("tr-TR");
}
