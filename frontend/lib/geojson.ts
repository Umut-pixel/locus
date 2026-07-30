import type { Feature, FeatureCollection, Point } from "geojson";
import type { MusteriHarita } from "./types";

export type MusteriFeature = Feature<Point, MusteriHarita>;
export type MusteriFeatureCollection = FeatureCollection<Point, MusteriHarita>;

export function musterilerToGeoJSON(
  rows: MusteriHarita[],
  /** Varsa highlight bayrağını tek geçişte yazar (çift map yok). */
  highlightSet?: ReadonlySet<string> | null
): MusteriFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((row): MusteriFeature => {
      const properties =
        highlightSet == null
          ? row
          : {
              ...row,
              son_yuklemede_guncellendi: highlightSet.has(row.musteri_kodu)
                ? (1 as const)
                : (0 as const),
            };
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lon, row.lat] },
        properties,
      };
    }),
  };
}
