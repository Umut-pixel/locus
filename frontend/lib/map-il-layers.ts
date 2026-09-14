import type { GeoJSONSource, LngLatBoundsLike, Map as MapboxMap } from "mapbox-gl";

import { POTANSIYEL_COLOR } from "@/lib/map-potansiyel-layers";

/**
 * İl sınırı katmanı — "Potansiyel müşteri ara" modunda haritayı kaplayan,
 * hover'da belirginleşen soluk gri dilimler.
 *
 * Uygulamadaki TEK `fill` katmanı. `lib/mapbox-style-light.ts` içindeki fill
 * örnekleri ölü kod (hiçbir yerden import edilmiyor), oradan kopyalamayın.
 */

export const IL_SOURCE_ID = "iller";
export const IL_FILL_LAYER = "il-fill";
export const IL_OUTLINE_LAYER = "il-outline";

/** Nötr gri — müşteri risk paletiyle de potansiyel sarısıyla da çakışmaz. */
const IL_NOTR = "#94a3b8";
const IL_STROKE = "#64748b";
const IL_HOVER_STROKE = "#475569";

export const IL_VERI_YOLU = "/veri/turkiye-iller.geojson";

/** Türkiye'nin kaba sınırları — mod açılınca kamera buraya oturur. */
export const TURKIYE_BOUNDS: LngLatBoundsLike = [
  [25.5, 35.6],
  [45.0, 42.4],
];

export type IlFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { plaka: number; ad: string }
>;

const EMPTY: IlFeatureCollection = { type: "FeatureCollection", features: [] };

const LAYER_IDS = [IL_OUTLINE_LAYER, IL_FILL_LAYER] as const;

let veriCache: IlFeatureCollection | null = null;
let veriIstegi: Promise<IlFeatureCollection> | null = null;

/**
 * İl sınırlarını tembel yükler (mod ilk açıldığında, sayfa açılışında değil).
 * Modül düzeyinde cache'lenir: tema değişiminde `mountOverlays` yeniden
 * çalışıp kaynağı sıfırdan kurarken ağa tekrar gitmeyelim.
 */
export async function ilSinirlariniYukle(
  signal?: AbortSignal
): Promise<IlFeatureCollection> {
  if (veriCache) return veriCache;
  if (!veriIstegi) {
    veriIstegi = fetch(IL_VERI_YOLU, { signal, cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`İl sınırları yüklenemedi (HTTP ${res.status}).`);
        return res.json() as Promise<IlFeatureCollection>;
      })
      .then((fc) => {
        veriCache = fc;
        return fc;
      })
      .catch((err) => {
        veriIstegi = null; // tekrar denenebilsin
        throw err;
      });
  }
  return veriIstegi;
}

/** Zaten yüklenmişse senkron döner — `mountOverlays` bunu kullanır. */
export function ilSinirlariCache(): IlFeatureCollection | null {
  return veriCache;
}

export function addIlLayers(
  map: MapboxMap,
  opts?: { visible?: boolean; beforeId?: string }
) {
  const visibility = opts?.visible ? "visible" : "none";
  const before =
    opts?.beforeId && map.getLayer(opts.beforeId) ? opts.beforeId : undefined;

  if (!map.getSource(IL_SOURCE_ID)) {
    map.addSource(IL_SOURCE_ID, {
      type: "geojson",
      // Tel formatı plaka: feature-state ve tıklama hep sayısal plakayla
      // çalışır, il adı hiçbir yerde anahtar değildir.
      promoteId: "plaka",
      data: veriCache ?? EMPTY,
    });
  }

  if (!map.getLayer(IL_FILL_LAYER)) {
    map.addLayer(
      {
        id: IL_FILL_LAYER,
        type: "fill",
        source: IL_SOURCE_ID,
        // `slot: "middle"` — basemap etiketlerinin ve yollarının ALTINA.
        // lib/mapbox-style.ts'teki "overlay'lere slot verilmez" kuralından
        // bilinçli sapma: bu bir arka plan yıkaması, üstte durursa şehir
        // isimlerini yutar. Başka hiçbir katmanı etkilemiyor.
        slot: "middle",
        layout: { visibility },
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "secili"], false],
            POTANSIYEL_COLOR,
            IL_NOTR,
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "secili"], false],
            0.3,
            ["boolean", ["feature-state", "hover"], false],
            0.22,
            0.1,
          ],
          "fill-emissive-strength": 1,
        },
      },
      before
    );
  }

  if (!map.getLayer(IL_OUTLINE_LAYER)) {
    map.addLayer(
      {
        id: IL_OUTLINE_LAYER,
        type: "line",
        source: IL_SOURCE_ID,
        slot: "middle",
        layout: { visibility, "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            IL_HOVER_STROKE,
            IL_STROKE,
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "secili"], false],
            2.2,
            ["boolean", ["feature-state", "hover"], false],
            1.6,
            0.8,
          ],
          "line-opacity": 0.55,
          "line-emissive-strength": 1,
        },
      },
      before
    );
  }
}

export function setIlVisibility(map: MapboxMap, visible: boolean) {
  const v = visible ? "visible" : "none";
  for (const id of LAYER_IDS) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", v);
  }
}

export function setIlData(map: MapboxMap, data: IlFeatureCollection) {
  const source = map.getSource(IL_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(data as unknown as GeoJSON.FeatureCollection);
}

export function setIlFeatureState(
  map: MapboxMap,
  plaka: number | null,
  state: { hover?: boolean; secili?: boolean }
) {
  if (plaka == null || !map.getSource(IL_SOURCE_ID)) return;
  map.setFeatureState({ source: IL_SOURCE_ID, id: plaka }, state);
}

export function clearIlFeatureStates(map: MapboxMap) {
  if (!map.getSource(IL_SOURCE_ID)) return;
  map.removeFeatureState({ source: IL_SOURCE_ID });
}

/** Bir ilin poligonundan kamera kutusu — centroid DEĞİL (Muğla dağlara düşer). */
export function ilBounds(
  fc: IlFeatureCollection,
  plaka: number
): LngLatBoundsLike | null {
  const feat = fc.features.find((f) => f.properties.plaka === plaka);
  if (!feat) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const gez = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      const [lon, lat] = c as [number, number];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const alt of c) gez(alt);
  };
  gez(feat.geometry.coordinates);

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
