"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  DEFAULT_MAP_VIEW,
  MAPBOX_STYLE_URL,
  MAPBOX_TOKEN,
} from "@/lib/mapbox-style";

/** Login arka planı — etkileşimsiz, dashboard stiliyle aynı Mapbox haritası. */
export function LoginMapPreview() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE_URL,
      center: DEFAULT_MAP_VIEW.center,
      zoom: DEFAULT_MAP_VIEW.zoom,
      interactive: false,
      attributionControl: false,
      logoPosition: "bottom-left",
    });
    mapRef.current = map;

    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="size-full bg-[oklch(0.16_0.004_260)]" aria-hidden />
    );
  }

  return <div ref={containerRef} className="size-full" aria-hidden />;
}
