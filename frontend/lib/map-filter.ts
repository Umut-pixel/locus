import type { RiskDurumu } from "./types";
import {
  DEFAULT_TIP_FILTER,
  tipKanalFromMusteriGrubu,
  tipPassesFilter,
  type TipKanalFilter,
} from "./tip-style";

export interface MapFilterState {
  cities: string[];
  risk: RiskDurumu | null;
  /**
   * true → YEM TOPTAN / GELENEKSEL vb. de göster.
   * Varsayılan false: yalnızca seçili petshop / veteriner.
   */
  includeDigerKanallar?: boolean;
  /** Petshop / veteriner toggle’ları — varsayılan ikisi de açık. */
  tipFilter?: TipKanalFilter;
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
  const tipFilter = state.tipFilter ?? DEFAULT_TIP_FILTER;

  return rows.filter((row) => {
    if (citySet && (!row.sehir || !citySet.has(row.sehir))) {
      return false;
    }
    if (state.risk && row.risk_durumu !== state.risk) return false;
    const tip = tipKanalFromMusteriGrubu(row.musteri_grubu);
    if (!tipPassesFilter(tip, tipFilter, includeDiger)) return false;
    return true;
  });
}
