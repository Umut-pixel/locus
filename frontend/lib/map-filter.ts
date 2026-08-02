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
>(
  rows: T[],
  state: MapFilterState,
  /** Önceden hesaplanmış `${unvan} ${kod}` lowercase — her filtrede yeniden toLocaleLowerCase yok. */
  searchHaystacks?: ReadonlyMap<string, string>
): T[] {
  const q = state.search.trim().toLocaleLowerCase("tr");
  const citySet =
    state.cities.length > 0 ? new Set(state.cities) : null;

  return rows.filter((row) => {
    if (citySet && (!row.sehir || !citySet.has(row.sehir))) {
      return false;
    }
    if (state.risk && row.risk_durumu !== state.risk) return false;
    if (q) {
      const haystack =
        searchHaystacks?.get(row.musteri_kodu) ??
        `${row.unvan} ${row.musteri_kodu}`.toLocaleLowerCase("tr");
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
