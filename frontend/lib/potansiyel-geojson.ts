import type { Feature, FeatureCollection, Point } from "geojson";

import { tipKanalFromPrimaryType } from "./tip-style";
import type { PotansiyelHarita } from "./types";

export type PotansiyelFeature = Feature<Point, PotansiyelHarita>;
export type PotansiyelFeatureCollection = FeatureCollection<
  Point,
  PotansiyelHarita
>;

export function potansiyellerToGeoJSON(
  rows: PotansiyelHarita[],
  favoriIds?: ReadonlySet<string>
): PotansiyelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map(
      (row): PotansiyelFeature => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lon, row.lat] },
        properties: {
          ...row,
          tip_kanal: tipKanalFromPrimaryType(row.primary_type),
          favori: favoriIds ? favoriIds.has(row.id) : Boolean(row.favori),
        },
      })
    ),
  };
}
