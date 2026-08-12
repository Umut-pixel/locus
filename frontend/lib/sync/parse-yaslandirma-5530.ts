import {
  RISK_FIELDS,
  YAS_BUCKET_MAP,
  yasTutarCevir,
} from "@/lib/import/parse-yaslandirma";
import type { YaslandirmaUpdateRow } from "@/lib/import/types";
import { metinTemizle } from "@/lib/import/utils";

/** Excel / landing `hafta` değerini YAS_BUCKET_MAP anahtarına normalize et. */
function normalizeHaftaBand(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  // "70 Üstü" / "70 ustu" / "70+"
  if (/^70\s*(üstü|ustu|\+)$/i.test(s) || s === "70+") {
    return "70 Üstü";
  }
  // "01-06" / "01 - 06" / "1 - 6"
  const m = s.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
  if (m) {
    const a = m[1].padStart(2, "0");
    const b = m[2].padStart(2, "0");
    return `${a} - ${b}`;
  }
  return s;
}

const BUCKET_BY_EXCEL = new Map(
  YAS_BUCKET_MAP.map((b) => [b.excel, b.field] as const)
);

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

export interface ParseYaslandirma5530Result {
  rows: YaslandirmaUpdateRow[];
  islenenSatir: number;
  bilinmeyenHafta: number;
  toplamAtlanan: number;
}

/**
 * 5530 AcikFaturaVadeKup landing satırlarını müşteri kova snapshot'ına çevir.
 * `hafta = Toplam` sentinel'leri atlanır (çift sayım yok).
 */
export function parseYaslandirma5530(
  rows: Record<string, unknown>[]
): ParseYaslandirma5530Result {
  const byKod = new Map<string, YaslandirmaUpdateRow>();
  let bilinmeyenHafta = 0;
  let toplamAtlanan = 0;
  let islenenSatir = 0;

  for (const row of rows) {
    const haftaRaw = metinTemizle(row.hafta ?? row.Hafta);
    if (!haftaRaw) continue;
    if (haftaRaw.toLocaleLowerCase("tr-TR") === "toplam") {
      toplamAtlanan += 1;
      continue;
    }

    const kod = metinTemizle(row.musteri_kod ?? row.MusteriKod ?? row.musteri_kodu);
    if (!kod) continue;

    const band = normalizeHaftaBand(haftaRaw);
    const field = BUCKET_BY_EXCEL.get(band);
    if (!field) {
      bilinmeyenHafta += 1;
      continue;
    }

    const amount = yasTutarCevir(row.kalan_tutar ?? row.KalanTutar);
    const unvan = metinTemizle(row.musteri ?? row.Musteri);
    const stRaw = metinTemizle(row.st ?? row.ST);
    const st = stRaw || null;

    let parsed = byKod.get(kod);
    if (!parsed) {
      parsed = zeroRow(kod, unvan, st);
      byKod.set(kod, parsed);
    } else {
      if (!parsed.unvan && unvan) parsed.unvan = unvan;
      if (!parsed.st && st) parsed.st = st;
    }

    const prev = Number(parsed[field]) || 0;
    (parsed as unknown as Record<string, number>)[field] =
      Math.round((prev + amount) * 100) / 100;
    islenenSatir += 1;
  }

  const out: YaslandirmaUpdateRow[] = [];
  for (const parsed of byKod.values()) {
    const toplam = YAS_BUCKET_MAP.reduce(
      (sum, b) => sum + (Number(parsed[b.field]) || 0),
      0
    );
    parsed.toplam = Math.round(toplam * 100) / 100;
    const riskli = RISK_FIELDS.reduce(
      (sum, f) => sum + (Number(parsed[f]) || 0),
      0
    );
    parsed.riskli_tutar = Math.round(riskli * 100) / 100;
    parsed.borc_riskli = parsed.riskli_tutar > 0.005;
    out.push(parsed);
  }

  return {
    rows: out,
    islenenSatir,
    bilinmeyenHafta,
    toplamAtlanan,
  };
}
