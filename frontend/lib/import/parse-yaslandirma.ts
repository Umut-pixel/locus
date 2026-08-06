import type { YaslandirmaUpdateRow } from "./types";
import { cellStr, metinTemizle, sayiyaCevir } from "./utils";

/** Excel gün bandı → DB kolonu (trim edilmiş header). */
export const YAS_BUCKET_MAP: Array<{ excel: string; field: keyof YaslandirmaUpdateRow; label: string }> = [
  { excel: "01 - 06", field: "hf_01_06", label: "01-06" },
  { excel: "07 - 13", field: "hf_07_13", label: "07-13" },
  { excel: "14 - 20", field: "hf_14_20", label: "14-20" },
  { excel: "21 - 27", field: "hf_21_27", label: "21-27" },
  { excel: "28 - 34", field: "hf_28_34", label: "28-34" },
  { excel: "35 - 41", field: "hf_35_41", label: "35-41" },
  { excel: "42 - 48", field: "hf_42_48", label: "42-48" },
  { excel: "49 - 55", field: "hf_49_55", label: "49-55" },
  { excel: "56 - 62", field: "hf_56_62", label: "56-62" },
  { excel: "63 - 69", field: "hf_63_69", label: "63-69" },
  { excel: "70 Üstü", field: "hf_70_ustu", label: "70+" },
];

const RISK_FIELDS: Array<keyof YaslandirmaUpdateRow> = [
  "hf_56_62",
  "hf_63_69",
  "hf_70_ustu",
];

/** Header anahtarını trim ederek satırdan değer al. */
function cellByTrimmed(
  row: Record<string, unknown>,
  wanted: string
): unknown {
  const target = wanted.trim().toLocaleLowerCase("tr-TR");
  for (const [key, value] of Object.entries(row)) {
    if (String(key).trim().toLocaleLowerCase("tr-TR") === target) {
      return value;
    }
  }
  return undefined;
}

/** Ham sayı / TR / US binlik formatlarını güvenli parse et. */
export function yasTutarCevir(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return 0;
  let s = String(value).trim().replace(/\s/g, "");
  if (!s || s === "-") return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Son ayırıcı ondalık: 11.540,03 (TR) veya 11,540.03 (US)
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // 11540,03 veya 11,540 (binlik) — tek virgül + 3 hane → binlik varsay
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length === 3 && !parts[0].includes(".")) {
      // Ambiguous; yaşlandırmada tutarlar genelde 2 ondalıklı → virgül ondalık
      s = s.replace(",", ".");
    } else {
      s = s.replace(",", ".");
    }
  }

  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return sayiyaCevir(value) ?? 0;
}

function zeroRow(
  musteri_kodu: string,
  unvan: string,
  st: string | null
): YaslandirmaUpdateRow {
  return {
    musteri_kodu,
    unvan,
    st,
    hf_01_06: 0,
    hf_07_13: 0,
    hf_14_20: 0,
    hf_21_27: 0,
    hf_28_34: 0,
    hf_35_41: 0,
    hf_42_48: 0,
    hf_49_55: 0,
    hf_56_62: 0,
    hf_63_69: 0,
    hf_70_ustu: 0,
    toplam: 0,
    riskli_tutar: 0,
    borc_riskli: false,
  };
}

/**
 * ST Yaşlandırma detay satırlarını DB satırlarına çevir.
 * Eşleşme anahtarı: Müşteri Kodu → musteri_kodu.
 */
export function parseStYaslandirma(rows: Record<string, unknown>[]): {
  rows: YaslandirmaUpdateRow[];
  islenenSatir: number;
} {
  const out: YaslandirmaUpdateRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const kod = metinTemizle(
      cellByTrimmed(row, "Müşteri Kodu") ??
        cellStr(row, "Müşteri Kodu", "Musteri Kodu", "musteri_kodu")
    );
    if (!kod) continue;

    const unvan = metinTemizle(
      cellByTrimmed(row, "Müşteri") ?? cellStr(row, "Müşteri", "Musteri")
    );
    const stRaw = metinTemizle(
      cellByTrimmed(row, "ST") ?? cellStr(row, "ST")
    );
    const st = stRaw || null;

    const parsed = zeroRow(kod, unvan, st);

    for (const bucket of YAS_BUCKET_MAP) {
      const raw = cellByTrimmed(row, bucket.excel);
      const amount = yasTutarCevir(raw);
      (parsed as unknown as Record<string, number>)[bucket.field] =
        Math.round(amount * 100) / 100;
    }

    const toplamRaw = cellByTrimmed(row, "Toplam");
    let toplam = yasTutarCevir(toplamRaw);
    if (!toplam) {
      toplam = YAS_BUCKET_MAP.reduce(
        (sum, b) => sum + (Number(parsed[b.field]) || 0),
        0
      );
    }
    parsed.toplam = Math.round(toplam * 100) / 100;

    const riskli = RISK_FIELDS.reduce(
      (sum, f) => sum + (Number(parsed[f]) || 0),
      0
    );
    parsed.riskli_tutar = Math.round(riskli * 100) / 100;
    parsed.borc_riskli = parsed.riskli_tutar > 0.005;

    if (seen.has(kod)) {
      // Aynı kod tekrar gelirse son satır geçerli
      const idx = out.findIndex((r) => r.musteri_kodu === kod);
      if (idx >= 0) out[idx] = parsed;
    } else {
      seen.add(kod);
      out.push(parsed);
    }
  }

  return { rows: out, islenenSatir: out.length };
}
