import type { Feature, FeatureCollection, Point } from "geojson";
import { tipKanalFromMusteriGrubu } from "./tip-style";
import type { MusteriHarita } from "./types";

export type MusteriFeature = Feature<Point, MusteriHarita>;
export type MusteriFeatureCollection = FeatureCollection<Point, MusteriHarita>;

export function musterilerToGeoJSON(
  rows: MusteriHarita[],
  /** Varsa highlight bayrağını tek geçişte yazar (çift map yok). */
  highlightSet?: ReadonlySet<string> | null,
  favoriKodlari?: ReadonlySet<string> | null
): MusteriFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((row): MusteriFeature => {
      const tip_kanal = tipKanalFromMusteriGrubu(row.musteri_grubu);
      const base: MusteriHarita = { ...row, tip_kanal };
      let properties: MusteriHarita = base;
      if (highlightSet != null || favoriKodlari != null) {
        properties = {
          ...base,
          ...(highlightSet != null
            ? {
                son_yuklemede_guncellendi: highlightSet.has(row.musteri_kodu)
                  ? (1 as const)
                  : (0 as const),
              }
            : {}),
          favori: favoriKodlari
            ? favoriKodlari.has(row.musteri_kodu)
            : Boolean(row.favori),
        };
      }
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lon, row.lat] },
        properties,
      };
    }),
  };
}
