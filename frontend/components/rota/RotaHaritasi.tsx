"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { RotaDuragi } from "@/hooks/useRotaPlani";
import { DEPOT } from "@/lib/depot";
import { fetchDrivingRoute } from "@/lib/mapbox-directions";
import {
  applyMapRuntimeTuning,
  applyMapStyle,
  mapRenderOptions,
  observeMapContainer,
} from "@/lib/mapbox-init";
import { revealStageVeil } from "@/lib/map-curtain";
import { MAPBOX_TOKEN, mapboxStyleForTheme } from "@/lib/mapbox-style";
import { useTheme } from "@/components/theme/ThemeProvider";

const LINE_SOURCE = "rota-plan-line";
const LINE_LAYER = "rota-plan-line";
const LINE_CASING = "rota-plan-line-casing";

/** Araç başına ayrı renk — kartlarla harita aynı paleti kullanır. */
export const ARAC_RENKLERI = [
  "#4285F4",
  "#f59e0b",
  "#10b981",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
] as const;

export function aracRengi(index: number): string {
  return ARAC_RENKLERI[index % ARAC_RENKLERI.length]!;
}

type LngLat = [number, number];

export interface HaritaRotasi {
  aracKod: string;
  aracAd: string;
  renk: string;
  duraklar: RotaDuragi[];
}

interface RotaHaritasiProps {
  rotalar: HaritaRotasi[];
  /** Henüz atanmamış duraklar — soluk noktalarla gösterilir. */
  havuz: RotaDuragi[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function popupHtml(title: string, subtitle?: string): string {
  const sub = subtitle
    ? `<div style="font-size:11px;opacity:0.7;margin-top:3px">${escapeHtml(subtitle)}</div>`
    : "";
  return `<div style="line-height:1.4;min-width:120px;padding:8px 10px;font-family:var(--font-geist-sans),system-ui,sans-serif">
    <div style="font-size:12px;font-weight:600">${escapeHtml(title)}</div>${sub}
  </div>`;
}

function createDepotEl(): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", DEPOT.label);
  el.title = `${DEPOT.label} — ${DEPOT.address}`;
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 2px 8px rgba(28,29,32,0.38))";
  el.innerHTML = `
    <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:#1c1d20;border:2px solid #f4f4f5;color:#f4f4f5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        <path d="M9 21v-7h6v7" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
      </svg>
    </span>
    <span style="font:600 11px/1.3 var(--font-geist-sans),system-ui,sans-serif;color:#1c1d20;background:#f4f4f5;padding:2px 7px;border-radius:999px;border:1px solid rgba(28,29,32,0.12);white-space:nowrap">Depo</span>
  `;
  return el;
}

function createStopEl(index: number, label: string, renk: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${index}. ${label}`);
  el.title = `${index}. ${label}`;
  el.style.cssText =
    `display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;border:2px solid #fff;background:${renk};color:#fff;font:700 12px/1 var(--font-geist-sans),system-ui,sans-serif;padding:0;cursor:pointer;box-shadow:0 1px 5px rgba(28,29,32,0.35)`;
  el.textContent = String(index);
  return el;
}

/** Atanmamış durak — soluk, numarasız. */
function createHavuzEl(label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.title = `${label} — henüz araca atanmadı`;
  el.style.cssText =
    "width:11px;height:11px;border-radius:999px;border:1.5px solid rgba(255,255,255,0.85);background:#94a3b8;padding:0;cursor:pointer;opacity:0.75";
  return el;
}

function lineFeature(
  coords: LngLat[],
  renk: string
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: { renk },
    geometry: { type: "LineString", coordinates: coords },
  };
}

/** Depo → 1 → 2 → … (dönüş yok — AgentRouteMap ile aynı kural). */
function rotaNoktalari(duraklar: RotaDuragi[]): LngLat[] {
  const stops: LngLat[] = [];
  for (const d of duraklar) {
    if (d.lat == null || d.lon == null) continue;
    stops.push([d.lon, d.lat]);
  }
  return stops.length > 0 ? [DEPOT.lngLat, ...stops] : [];
}

/**
 * Plan haritası — araç başına ayrı renkli güzergâh, atanmamış duraklar soluk.
 * Yol oturtma mevcut Mapbox Directions katmanıyla; başarısız olursa düz çizgi.
 */
export function RotaHaritasi({ rotalar, havuz }: RotaHaritasiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageVeilRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleUrlRef = useRef<string | null>(null);
  const { theme } = useTheme();
  // Harita init effect'i tema değerini ref üzerinden okur; ref render sırasında
  // değil effect'te güncellenir (react-hooks/refs).
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  /** Yeniden çizim anahtarı — atama değişince harita güncellensin. */
  const planKey = useMemo(
    () =>
      JSON.stringify([
        rotalar.map((r) => [r.aracKod, r.renk, r.duraklar.map((d) => d.musteriKodu)]),
        havuz.map((d) => d.musteriKodu),
      ]),
    [rotalar, havuz]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const fitTargets: LngLat[] = [DEPOT.lngLat];
    for (const r of rotalar) {
      for (const d of r.duraklar) {
        if (d.lat != null && d.lon != null) fitTargets.push([d.lon, d.lat]);
      }
    }
    for (const d of havuz) {
      if (d.lat != null && d.lon != null) fitTargets.push([d.lon, d.lat]);
    }

    const duzCizgiler: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: rotalar
        .map((r) => ({ coords: rotaNoktalari(r.duraklar), renk: r.renk }))
        .filter((x) => x.coords.length >= 2)
        .map((x) => lineFeature(x.coords, x.renk)),
    };

    const map = new mapboxgl.Map({
      container: el,
      ...mapRenderOptions(themeRef.current),
      center: fitTargets[0] ?? DEPOT.lngLat,
      zoom: fitTargets.length <= 1 ? 11 : 8,
      attributionControl: false,
      cooperativeGestures: true,
      logoPosition: "bottom-left",
    });
    mapRef.current = map;
    styleUrlRef.current = mapboxStyleForTheme(themeRef.current);
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    const unobserve = observeMapContainer(map, el);
    const markers: mapboxgl.Marker[] = [];
    const ac = new AbortController();

    const addMarkers = () => {
      for (const m of markers) m.remove();
      markers.length = 0;

      markers.push(
        new mapboxgl.Marker({ element: createDepotEl(), anchor: "bottom" })
          .setLngLat(DEPOT.lngLat)
          .setPopup(
            new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
              popupHtml(DEPOT.label, DEPOT.address)
            )
          )
          .addTo(map)
      );

      for (const rota of rotalar) {
        rota.duraklar.forEach((d, i) => {
          if (d.lat == null || d.lon == null) return;
          markers.push(
            new mapboxgl.Marker({
              element: createStopEl(i + 1, d.unvan, rota.renk),
              anchor: "center",
            })
              .setLngLat([d.lon, d.lat])
              .setPopup(
                new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
                  popupHtml(
                    `${i + 1}. ${d.unvan}`,
                    `${rota.aracAd} · ${Math.round(d.kg)} kg`
                  )
                )
              )
              .addTo(map)
          );
        });
      }

      for (const d of havuz) {
        if (d.lat == null || d.lon == null) continue;
        markers.push(
          new mapboxgl.Marker({ element: createHavuzEl(d.unvan), anchor: "center" })
            .setLngLat([d.lon, d.lat])
            .setPopup(
              new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
                popupHtml(d.unvan, `Atanmadı · ${Math.round(d.kg)} kg`)
              )
            )
            .addTo(map)
        );
      }
    };

    const fit = () => {
      if (fitTargets.length === 1) {
        map.easeTo({ center: fitTargets[0], zoom: 11, duration: 0 });
        return;
      }
      const bounds = new mapboxgl.LngLatBounds();
      for (const c of fitTargets) bounds.extend(c);
      map.fitBounds(bounds, {
        padding: { top: 56, bottom: 48, left: 48, right: 56 },
        maxZoom: 12,
        duration: 0,
      });
    };

    const ensureLineLayers = () => {
      if (!map.getSource(LINE_SOURCE)) {
        map.addSource(LINE_SOURCE, { type: "geojson", data: duzCizgiler });
      }
      if (!map.getLayer(LINE_CASING)) {
        map.addLayer({
          id: LINE_CASING,
          type: "line",
          source: LINE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0f172a", "line-width": 7, "line-opacity": 0.28 },
        });
      }
      if (!map.getLayer(LINE_LAYER)) {
        map.addLayer({
          id: LINE_LAYER,
          type: "line",
          source: LINE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "renk"],
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });
      }
    };

    const onStyle = () => {
      applyMapRuntimeTuning(map, themeRef.current);
      ensureLineLayers();
      addMarkers();
      fit();

      // Yolları oturt — araç başına tek istek, hata olursa düz çizgi kalır
      void Promise.all(
        rotalar.map(async (r) => {
          const coords = rotaNoktalari(r.duraklar);
          if (coords.length < 2) return null;
          const yol = await fetchDrivingRoute(coords, ac.signal);
          return lineFeature(yol ?? coords, r.renk);
        })
      )
        .then((features) => {
          if (ac.signal.aborted) return;
          const kalan = features.filter(
            (f): f is GeoJSON.Feature<GeoJSON.LineString> => f !== null
          );
          if (kalan.length === 0) return;
          const src = map.getSource(LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
          src?.setData({ type: "FeatureCollection", features: kalan });
        })
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return;
        });
    };

    map.on("style.load", onStyle);
    map.once("idle", () => revealStageVeil(stageVeilRef.current));

    return () => {
      ac.abort();
      unobserve();
      for (const m of markers) m.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [planKey]);

  useEffect(() => {
    const map = mapRef.current;
    const next = mapboxStyleForTheme(theme);
    if (!map || styleUrlRef.current === next) return;
    styleUrlRef.current = next;
    try {
      map.stop();
    } catch {
      /* yok */
    }
    applyMapStyle(map, theme);
  }, [theme]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-[13px] text-muted-foreground">
          NEXT_PUBLIC_MAPBOX_TOKEN tanımlı değil — harita gösterilemiyor.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={stageVeilRef}
        className="pointer-events-none absolute inset-0 bg-background"
        aria-hidden
      />
    </div>
  );
}
