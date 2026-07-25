import type { Feature, FeatureCollection, Point } from "geojson";
import type { MusteriHarita } from "./types";

export type MusteriFeature = Feature<Point, MusteriHarita>;
export type MusteriFeatureCollection = FeatureCollection<Point, MusteriHarita>;

export function musterilerToGeoJSON(
  rows: MusteriHarita[]
): MusteriFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((row): MusteriFeature => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.lon, row.lat] },
      properties: row,
    })),
  };
}
