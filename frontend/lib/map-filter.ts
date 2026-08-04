import type { RiskDurumu } from "./types";

export interface MapFilterState {
  cities: string[];
  risk: RiskDurumu | null;
}

export function filterRowsLocally<
  T extends {
    sehir: string | null;
    risk_durumu: RiskDurumu;
  },
>(rows: T[], state: MapFilterState): T[] {
  const citySet =
    state.cities.length > 0 ? new Set(state.cities) : null;

  return rows.filter((row) => {
    if (citySet && (!row.sehir || !citySet.has(row.sehir))) {
      return false;
    }
    if (state.risk && row.risk_durumu !== state.risk) return false;
    return true;
  });
}
