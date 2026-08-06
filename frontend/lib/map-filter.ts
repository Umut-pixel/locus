import type { RiskDurumu } from "./types";
import { tipKanalFromMusteriGrubu } from "./tip-style";

export interface MapFilterState {
  cities: string[];
  risk: RiskDurumu | null;
  /**
   * true → YEM TOPTAN / GELENEKSEL vb. de göster.
   * Varsayılan false: yalnızca petshop + veteriner.
   */
  includeDigerKanallar?: boolean;
}

export function filterRowsLocally<
  T extends {
    sehir: string | null;
    risk_durumu: RiskDurumu;
    musteri_grubu?: string | null;
  },
>(rows: T[], state: MapFilterState): T[] {
  const citySet =
    state.cities.length > 0 ? new Set(state.cities) : null;
  const includeDiger = Boolean(state.includeDigerKanallar);

  return rows.filter((row) => {
    if (citySet && (!row.sehir || !citySet.has(row.sehir))) {
      return false;
    }
    if (state.risk && row.risk_durumu !== state.risk) return false;
    if (!includeDiger) {
      const tip = tipKanalFromMusteriGrubu(row.musteri_grubu);
      if (tip === "diger") return false;
    }
    return true;
  });
}
