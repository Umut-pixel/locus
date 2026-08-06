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

/** Borç yaşlandırmasına göre risk bandı. */
export function debtRiskDurumu(row: {
  yas_toplam?: number | null;
  borc_riskli?: boolean | null;
}): RiskDurumu {
  if (row.yas_toplam == null) return "hic_teslimat_yok";
  if (row.borc_riskli) return "riskli";
  if (Number(row.yas_toplam) > 0.005) return "izlenmeli";
  return "saglikli";
}

export function effectiveRiskDurumu(
  row: Pick<MusteriHarita, "risk_durumu" | "yas_toplam" | "borc_riskli">,
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
