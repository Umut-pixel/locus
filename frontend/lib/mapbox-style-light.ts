import type { StyleSpecification } from "mapbox-gl";

/**
 * Yerel light-mode basemap — Mapbox Studio'daki eski koyu stilin yerine
 * doğrudan koda gömülü. `sources.composite` standart mapbox-streets-v8
 * olduğu için hesaba özel bir Studio stiline bağımlı değil.
 */
export const SHIPMENT_OPERATIONS_LIGHT_STYLE: StyleSpecification = {
  version: 8,
  name: "Shipment Operations Light",
  sources: {
    composite: {
      type: "vector",
      url: "mapbox://mapbox.mapbox-streets-v8",
    },
  },
  sprite: "mapbox://sprites/mapbox/streets-v8",
  glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#F8F8FA",
      },
    },
    {
      id: "water",
      type: "fill",
      source: "composite",
      "source-layer": "water",
      paint: {
        "fill-color": "#CFE3F2",
      },
    },
    {
      id: "waterway",
      type: "line",
      source: "composite",
      "source-layer": "waterway",
      paint: {
        "line-color": "#B9D8ED",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 1.5],
      },
    },
    {
      id: "parks",
      type: "fill",
      source: "composite",
      "source-layer": "landuse",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["park", "grass", "garden", "cemetery"]],
      ],
      paint: {
        "fill-color": "#D9ECD3",
        "fill-opacity": 1,
      },
    },
    {
      id: "building",
      type: "fill",
      source: "composite",
      "source-layer": "building",
      paint: {
        "fill-color": "#FFFFFF",
        "fill-opacity": 0.97,
      },
    },
    {
      id: "building-outline",
      type: "line",
      source: "composite",
      "source-layer": "building",
      paint: {
        "line-color": "#E3E5EA",
        "line-width": 0.6,
        "line-opacity": 0.9,
      },
    },
    {
      id: "road-casing",
      type: "line",
      source: "composite",
      "source-layer": "road",
      minzoom: 8,
      paint: {
        "line-color": "#DCE3EA",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 12, 1.5, 16, 4],
        "line-opacity": 1,
      },
    },
    {
      id: "road",
      type: "line",
      source: "composite",
      "source-layer": "road",
      minzoom: 8,
      paint: {
        "line-color": "#EFF1F4",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 12, 0.9, 16, 2.5],
        "line-opacity": 1,
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "composite",
      "source-layer": "road",
      minzoom: 10,
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["motorway", "trunk", "primary", "secondary"]],
      ],
      paint: {
        "line-color": "#C7D2E3",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 2, 16, 5],
        "line-opacity": 1,
      },
    },
    {
      id: "road-label",
      type: "symbol",
      source: "composite",
      "source-layer": "road",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 16, 11],
        "text-font": ["Open Sans Regular"],
      },
      paint: {
        "text-color": "#8A8A93",
        "text-halo-color": "#F8F8FA",
        "text-halo-width": 1,
        "text-opacity": 0.65,
      },
    },
    {
      id: "place-label-il",
      type: "symbol",
      source: "composite",
      "source-layer": "place_label",
      filter: [
        "in",
        ["get", "type"],
        ["literal", ["country", "state", "city"]],
      ],
      layout: {
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 12, 14, 15],
        "text-font": ["Open Sans Regular"],
      },
      paint: {
        "text-color": "#6C6C76",
        "text-halo-color": "#F8F8FA",
        "text-halo-width": 1.2,
        "text-opacity": 0.85,
      },
    },
    {
      id: "place-label-ilce",
      type: "symbol",
      source: "composite",
      "source-layer": "place_label",
      minzoom: 10,
      filter: [
        "in",
        ["get", "type"],
        [
          "literal",
          ["town", "village", "hamlet", "suburb", "neighbourhood", "island", "islet"],
        ],
      ],
      layout: {
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 12.5],
        "text-font": ["Open Sans Regular"],
      },
      paint: {
        "text-color": "#8A8A93",
        "text-halo-color": "#F8F8FA",
        "text-halo-width": 1.1,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 11, 0.8],
      },
    },
  ],
};
