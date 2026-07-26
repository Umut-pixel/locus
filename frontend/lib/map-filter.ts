import type { RiskDurumu } from "./types";

export interface MapFilterState {
  cities: string[];
  risk: RiskDurumu | null;
  search: string;
}

export function filterRowsLocally<
  T extends {
    sehir: string | null;
    risk_durumu: RiskDurumu;
    unvan: string;
    musteri_kodu: string;
  },
>(rows: T[], state: MapFilterState): T[] {
  const q = state.search.trim().toLocaleLowerCase("tr");
  return rows.filter((row) => {
    if (
      state.cities.length > 0 &&
      (!row.sehir || !state.cities.includes(row.sehir))
    ) {
      return false;
    }
    if (state.risk && row.risk_durumu !== state.risk) return false;
    if (q) {
      const haystack = `${row.unvan} ${row.musteri_kodu}`.toLocaleLowerCase("tr");
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
