import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap, MapOptions } from "mapbox-gl";

import {
  currentDocumentMapTheme,
  mapboxBasemapConfig,
  mapboxStyleForTheme,
  type MapTheme,
} from "@/lib/mapbox-style";
import { registerLiveMap } from "@/lib/map-curtain";

if (typeof window !== "undefined") {
  mapboxgl.prewarm();
}

/**
 * Ortak Mapbox render ayarları — tile pop-in'i keser, pan/zoom'u akıcı tutar.
 *
 * Globe + 3D objeler kare kare yüklenir. Operasyon haritası mercator;
 * basemap tile'ları bellek cache'inde tutulur, süre dolmuş tile yeniden
 * çekilmez (oturum boyunca aynı basemap).
 */
export function mapRenderOptions(
  theme: MapTheme = currentDocumentMapTheme()
): Omit<MapOptions, "container" | "center" | "zoom"> {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return {
    style: mapboxStyleForTheme(theme),
    projection: "mercator",
    // Retina zaten örnekler; MSAA yalnızca 1x ekranda. GPU fill rate düşer.
    antialias: dpr < 1.5,
    fadeDuration: 120,
    renderWorldCopies: false,
    minTileCacheSize: 64,
    maxTileCacheSize: 384,
    refreshExpiredTiles: false,
    trackResize: true,
    maxPitch: 45,
    preserveDrawingBuffer: false,
    collectResourceTiming: false,
    performanceMetricsCollection: false,
    precompilePrograms: true,
    respectPrefersReducedMotion: true,
    config: {
      basemap: mapboxBasemapConfig(theme),
    },
  };
}

/** Light/dark Studio stili + Standard config. `diff: false` iki URL arasında yama denemesin. */
export function applyMapStyle(map: MapboxMap, theme: MapTheme): void {
  map.setStyle(mapboxStyleForTheme(theme), {
    diff: false,
    localFontFamily: undefined,
    localIdeographFontFamily: undefined,
    config: {
      basemap: mapboxBasemapConfig(theme),
    },
  });
}

/** Stil yüklendikten sonra da zorla — Studio globe import'u constructor'ı ezer. */
export function applyMapRuntimeTuning(
  map: MapboxMap,
  theme: MapTheme = currentDocumentMapTheme()
): boolean {
  let projectionChanged = false;
  try {
    const name = map.getProjection()?.name;
    if (name !== "mercator") {
      map.setProjection("mercator");
      projectionChanged = true;
    }
  } catch {
    map.setProjection("mercator");
    projectionChanged = true;
  }
  const cfg = mapboxBasemapConfig(theme);
  for (const [key, value] of Object.entries(cfg)) {
    try {
      map.setConfigProperty("basemap", key, value);
    } catch {
      // Import id `basemap` değilse Standard config yok sayılır.
    }
  }
  return projectionChanged;
}

/**
 * Sidebar genişliği gibi kapsayıcı boyutu değişince canvas'ı senkronlar.
 * İlk gözlem (map zaten o ölçüde kuruldu) ve aynı ölçü tekrarları atlanır.
 */
export function observeMapContainer(
  map: MapboxMap,
  el: HTMLElement
): () => void {
  const unreg = registerLiveMap(map);
  let lastW = 0;
  let lastH = 0;
  let resizeQueued = false;
  const ro = new ResizeObserver((entries) => {
    const cr = entries[0]?.contentRect;
    if (!cr) return;
    const w = Math.round(cr.width);
    const h = Math.round(cr.height);
    if (w === lastW && h === lastH) return;
    if (lastW === 0 && lastH === 0) {
      lastW = w;
      lastH = h;
      return;
    }
    lastW = w;
    lastH = h;
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      try {
        if (!map.getStyle()) return;
        map.resize();
      } catch {
        // Stil yenilenirken resize paint hatası üretebiliyor.
      }
    });
  });
  ro.observe(el);
  return () => {
    unreg();
    ro.disconnect();
  };
}
