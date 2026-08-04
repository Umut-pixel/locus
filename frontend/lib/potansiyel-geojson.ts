import type { Feature, FeatureCollection, Point } from "geojson";

import type { PotansiyelHarita } from "./types";

export type PotansiyelFeature = Feature<Point, PotansiyelHarita>;
export type PotansiyelFeatureCollection = FeatureCollection<
  Point,
  PotansiyelHarita
>;

export function potansiyellerToGeoJSON(
  rows: PotansiyelHarita[]
): PotansiyelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map(
      (row): PotansiyelFeature => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lon, row.lat] },
        properties: row,
      })
    ),
  };
}
