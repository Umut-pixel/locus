import type { MusteriHarita, RiskDurumu } from "@/lib/types";

/** Harita / filtre sağlık metriği: sevkiyat gecikmesi veya borç yaşlandırma. */
export type RiskMetricMode = "sevkiyat" | "borc";

export const RISK_MODE_LABELS: Record<RiskMetricMode, string> = {
  sevkiyat: "Sevkiyat",
  borc: "Borç",
};

export const SEVKIYAT_RISK_LABELS: Record<RiskDurumu, string> = {
  saglikli: "Sağlıklı",
  izlenmeli: "İzlenmeli (>45 gün)",
  riskli: "Riskli (>90 gün)",
  hic_teslimat_yok: "Hiç teslimat yok",
};

export const SEVKIYAT_RISK_SHORT_LABELS: Record<RiskDurumu, string> = {
  saglikli: "Sağlıklı",
  izlenmeli: "İzlenmeli",
  riskli: "Riskli",
  hic_teslimat_yok: "Teslimatsız",
};

export const BORC_RISK_LABELS: Record<RiskDurumu, string> = {
  saglikli: "Temiz",
  izlenmeli: "Borçlu",
  riskli: "Riskli borç (56+ gün)",
  hic_teslimat_yok: "Yaşlandırma yok",
};

export const BORC_RISK_SHORT_LABELS: Record<RiskDurumu, string> = {
  saglikli: "Temiz",
  izlenmeli: "Borçlu",
  riskli: "Riskli",
  hic_teslimat_yok: "Verisiz",
};

export function riskLabelsForMode(mode: RiskMetricMode): Record<RiskDurumu, string> {
  return mode === "borc" ? BORC_RISK_LABELS : SEVKIYAT_RISK_LABELS;
}

export function riskShortLabelsForMode(
  mode: RiskMetricMode
): Record<RiskDurumu, string> {
  return mode === "borc" ? BORC_RISK_SHORT_LABELS : SEVKIYAT_RISK_SHORT_LABELS;
}

/**
 * Borcun "gerçek alacak" sayılması için gereken en küçük tutar (TL).
 *
 * NEDEN VAR: eskiden eşik 0.005 idi — bu bir iş kuralı değil, kayan nokta
 * gürültüsünü elemek için konmuş yarım-kuruşluk epsilon'du. Ama `borc_riskli`
 * bayrağı da aynı epsilon'la üretilip risk etiketi olarak kullanılınca, ERP'den
 * gelen 1 kuruşluk yuvarlama artığı müşteriyi "Riskli" yapıyordu.
 * 2026-08-11 ölçümü: 112 "Riskli" müşterinin 42'sinin (%37,5) riskli borcu
 * 1 TL'nin altındaydı; bazıları tam olarak ₺0,01 (ör. ₺75.178 toplam borcun
 * yalnızca ₺0,01'i 56+ günde olan müşteri "Riskli" görünüyordu).
 *
 * 1 TL, para biriminin altındaki artıkları eleyen en küçük eşik — bunun
 * üstündeki her tutar gerçek bir alacaktır. Kuruş bazlı raporlama gerekirse
 * burayı düşürmek yeterli.
 */
export const BORC_ONEMLILIK_ESIGI = 1;

/**
 * Borç yaşlandırmasına göre risk bandı.
 *
 * Karar TUTARLARDAN veriliyor, saklanan `borc_riskli` bayrağından değil:
 * bayrak "56+ günde bir kuruş bile var mı" sorusunun cevabı ve bu yüzden
 * önemlilik bilgisini kaybediyor (bkz. BORC_ONEMLILIK_ESIGI).
 */
export function debtRiskDurumu(row: {
  yas_toplam?: number | null;
  yas_riskli_tutar?: number | null;
}): RiskDurumu {
  if (row.yas_toplam == null) return "hic_teslimat_yok";
  if (Number(row.yas_riskli_tutar ?? 0) >= BORC_ONEMLILIK_ESIGI) return "riskli";
  if (Number(row.yas_toplam) >= BORC_ONEMLILIK_ESIGI) return "izlenmeli";
  return "saglikli";
}

/** Tutar önemli mi — kuruşluk yuvarlama artıklarını eler. */
export function borcOnemli(tutar: number | null | undefined): boolean {
  return Number(tutar ?? 0) >= BORC_ONEMLILIK_ESIGI;
}

export function effectiveRiskDurumu(
  row: Pick<MusteriHarita, "risk_durumu" | "yas_toplam" | "yas_riskli_tutar">,
  mode: RiskMetricMode
): RiskDurumu {
  if (mode === "borc") return debtRiskDurumu(row);
  return row.risk_durumu;
}

export function withEffectiveRisk(
  row: MusteriHarita,
  mode: RiskMetricMode
): MusteriHarita {
  if (mode === "sevkiyat") return row;
  const risk = debtRiskDurumu(row);
  if (risk === row.risk_durumu) return row;
  return { ...row, risk_durumu: risk };
}

export function withEffectiveRiskRows(
  rows: MusteriHarita[],
  mode: RiskMetricMode
): MusteriHarita[] {
  if (mode === "sevkiyat") return rows;
  return rows.map((row) => withEffectiveRisk(row, mode));
}
