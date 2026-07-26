import type { GeocodeHassasiyet, RiskDurumu } from "./types";

/** Charcoal zeminde okunur, neon'a kaçmayan risk renkleri. */
export const RISK_COLORS: Record<RiskDurumu, string> = {
  saglikli: "#4ade80",
  izlenmeli: "#fbbf24",
  riskli: "#ef4444",
  hic_teslimat_yok: "#8b8f98",
};

export const RISK_LABELS: Record<RiskDurumu, string> = {
  saglikli: "Sağlıklı",
  izlenmeli: "İzlenmeli (>45 gün)",
  riskli: "Riskli (>90 gün)",
  hic_teslimat_yok: "Hiç teslimat yok",
};

/** Segmented kontrol gibi dar alanlar için kısa etiketler. */
export const RISK_SHORT_LABELS: Record<RiskDurumu, string> = {
  saglikli: "Sağlıklı",
  izlenmeli: "İzlenmeli",
  riskli: "Riskli",
  hic_teslimat_yok: "Teslimatsız",
};

export const HASSASIYET_OPACITY: Record<GeocodeHassasiyet, number> = {
  saha_gps: 1,
  mahalle_merkezi: 0.75,
  ilce_merkezi: 0.45,
};

export const HASSASIYET_LABELS: Record<GeocodeHassasiyet, string> = {
  saha_gps: "Saha GPS (metre hassasiyet)",
  mahalle_merkezi: "Mahalle merkezi (~0,5–1 km)",
  ilce_merkezi: "İlçe merkezi (~5 km)",
};

export const RISK_ORDER: RiskDurumu[] = [
  "riskli",
  "izlenmeli",
  "saglikli",
  "hic_teslimat_yok",
];
