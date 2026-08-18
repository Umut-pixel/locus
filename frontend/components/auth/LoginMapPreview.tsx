"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { DEFAULT_MAP_VIEW, MAPBOX_TOKEN } from "@/lib/mapbox-style";
import {
  applyMapRuntimeTuning,
  MAP_RENDER_OPTIONS,
  observeMapContainer,
} from "@/lib/mapbox-init";

/** Login arka planı — etkileşimsiz, dashboard stiliyle aynı Mapbox haritası. */
export function LoginMapPreview() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      ...MAP_RENDER_OPTIONS,
      center: DEFAULT_MAP_VIEW.center,
      zoom: DEFAULT_MAP_VIEW.zoom,
      interactive: false,
      attributionControl: false,
      logoPosition: "bottom-left",
    });
    mapRef.current = map;
    const unobserveSize = observeMapContainer(map, containerRef.current);

    const onStyle = () => {
      applyMapRuntimeTuning(map);
    };
    map.on("style.load", onStyle);

    return () => {
      unobserveSize();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="size-full bg-[oklch(0.16_0.004_260)]" aria-hidden />
    );
  }

  return <div ref={containerRef} className="size-full" aria-hidden />;
}
