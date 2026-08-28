"use client";

import { useEffect, useMemo, useRef } from "react";
import { ArrowUpRightIcon } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "@/components/theme/ThemeProvider";
import type { MapBlock, MapPoint } from "@/lib/agent-blocks";
import { DEPOT, googleMapsDirUrl } from "@/lib/depot";
import { snapSegmentsToRoads } from "@/lib/mapbox-directions";
import {
  applyMapRuntimeTuning,
  mapRenderOptions,
  observeMapContainer,
} from "@/lib/mapbox-init";
import { MAPBOX_TOKEN, currentDocumentMapTheme } from "@/lib/mapbox-style";

const LINE_SOURCE = "agent-route-line";
const LINE_LAYER = "agent-route-line";
const LINE_CASING = "agent-route-line-casing";
const ROUTE_COLOR = "#4285F4";

type LngLat = [number, number];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Depo → 1 → 2 → … (dönüş yok). Numaralar `points` sırası. */
function orderedWaypoints(points: MapPoint[], includeDepot: boolean): LngLat[] {
  const stops: LngLat[] = points.map((p) => [p.lon, p.lat]);
  if (!includeDepot) return stops;
  return [DEPOT.lngLat, ...stops];
}

function hopSegments(coords: LngLat[]): LngLat[][] {
  const segs: LngLat[][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    segs.push([coords[i]!, coords[i + 1]!]);
  }
  return segs;
}

function lineCollection(
  segments: LngLat[][]
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features: segments
      .filter((coords) => coords.length >= 2)
      .map((coords, i) => ({
        type: "Feature" as const,
        properties: { segment: i },
        geometry: { type: "LineString" as const, coordinates: coords },
      })),
  };
}

function setLineData(
  map: mapboxgl.Map,
  data: GeoJSON.FeatureCollection<GeoJSON.LineString>
): void {
  const src = map.getSource(LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  src?.setData(data);
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

function createStopEl(index: number, label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${index}. ${label}`);
  el.title = `${index}. ${label}`;
  el.style.cssText =
    "display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;border:2px solid #fff;background:#4285F4;color:#fff;font:700 12px/1 var(--font-geist-sans),system-ui,sans-serif;padding:0;cursor:pointer;box-shadow:0 1px 5px rgba(28,29,32,0.35)";
  el.textContent = String(index);
  return el;
}

function popupHtml(title: string, subtitle?: string): string {
  const sub = subtitle
    ? `<div style="font-size:11px;opacity:0.7;margin-top:3px">${escapeHtml(subtitle)}</div>`
    : "";
  return `<div style="line-height:1.4;min-width:120px;padding:8px 10px;font-family:var(--font-geist-sans),system-ui,sans-serif">
    <div style="font-size:12px;font-weight:600">${escapeHtml(title)}</div>${sub}
  </div>`;
}

export function AgentRouteMap({ block }: { block: MapBlock }) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const pointsKey = useMemo(
    () =>
      JSON.stringify(
        block.points.map((p) => [p.lat, p.lon, p.label ?? "", p.meta ?? ""])
      ),
    [block.points]
  );
  const mapsUrl = useMemo(
    () => block.mapsUrl ?? googleMapsDirUrl(block.points, { includeDepot: block.includeDepot }),
    [block.includeDepot, block.mapsUrl, pointsKey]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const waypoints = orderedWaypoints(block.points, block.includeDepot);
    const hops = hopSegments(waypoints);
    const fallbackLine = lineCollection(hops);
    const fitTargets: LngLat[] = block.includeDepot
      ? [DEPOT.lngLat, ...block.points.map((p) => [p.lon, p.lat] as LngLat)]
      : block.points.map((p) => [p.lon, p.lat] as LngLat);

    const center = fitTargets[0] ?? DEPOT.lngLat;
    const map = new mapboxgl.Map({
      container: el,
      ...mapRenderOptions(currentDocumentMapTheme()),
      center,
      zoom: fitTargets.length <= 1 ? 13 : 7,
      attributionControl: false,
      cooperativeGestures: true,
      logoPosition: "bottom-left",
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    const unobserve = observeMapContainer(map, el);
    const markers: mapboxgl.Marker[] = [];
    const ac = new AbortController();

    const addMarkers = () => {
      if (block.includeDepot) {
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
      }
      block.points.forEach((p, i) => {
        const label = p.label ?? `Durak ${i + 1}`;
        const meta = p.meta;
        markers.push(
          new mapboxgl.Marker({ element: createStopEl(i + 1, label), anchor: "center" })
            .setLngLat([p.lon, p.lat])
            .setPopup(
              new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
                popupHtml(`${i + 1}. ${label}`, meta)
              )
            )
            .addTo(map)
        );
      });
    };

    const fit = () => {
      if (fitTargets.length === 0) return;
      if (fitTargets.length === 1) {
        map.easeTo({ center: fitTargets[0], zoom: 13, duration: 0 });
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
        map.addSource(LINE_SOURCE, {
          type: "geojson",
          data: fallbackLine,
        });
      }
      if (!map.getLayer(LINE_CASING)) {
        map.addLayer({
          id: LINE_CASING,
          type: "line",
          source: LINE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#1a4f9c",
            "line-width": 7,
            "line-opacity": 0.32,
          },
        });
      }
      if (!map.getLayer(LINE_LAYER)) {
        map.addLayer({
          id: LINE_LAYER,
          type: "line",
          source: LINE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ROUTE_COLOR,
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });
      }
    };

    const onStyle = () => {
      applyMapRuntimeTuning(map);
      ensureLineLayers();
      addMarkers();
      fit();
      if (hops.length === 0) return;
      void snapSegmentsToRoads(hops, ac.signal)
        .then((roads) => {
          if (ac.signal.aborted) return;
          if (roads.features.length === 0) return;
          setLineData(map, roads);
        })
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return;
        });
    };
    map.on("style.load", onStyle);

    return () => {
      ac.abort();
      unobserve();
      for (const m of markers) m.remove();
      map.remove();
    };
  }, [block.includeDepot, pointsKey, theme]);

  const title = block.title ?? "Rota";
  const stopCount = block.points.length;

  return (
    <div className="agent-table-shell @container my-5 mx-auto w-full max-w-none">
      <div className="flex h-12 items-center gap-3 border-b border-border/60 px-4">
        <p className="min-w-0 truncate text-[14px] font-medium text-ink">{title}</p>
        {stopCount > 0 ? (
          <span className="shrink-0 font-mono text-[12px] text-ink-3 tabular-nums">
            {stopCount} durak
          </span>
        ) : null}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] text-ink-2 underline-offset-2 hover:underline"
        >
          Google Maps
          <ArrowUpRightIcon className="size-3" strokeWidth={2} aria-hidden />
        </a>
      </div>
      {MAPBOX_TOKEN ? (
        <div
          ref={containerRef}
          className="h-[min(20rem,46svh)] min-h-[16rem] w-full @min-[32rem]:h-[min(32rem,58svh)] @min-[32rem]:min-h-[24rem]"
          role="img"
          aria-label={title}
        />
      ) : (
        <div className="flex h-24 items-center px-4 text-[12.5px] text-ink-3">
          Harita token yok — rotayı Google Maps’te aç.
        </div>
      )}
    </div>
  );
}
