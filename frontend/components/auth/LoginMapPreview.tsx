"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "@/components/theme/ThemeProvider";
import { revealStageVeil } from "@/lib/map-curtain";
import {
  applyMapRuntimeTuning,
  applyMapStyle,
  mapRenderOptions,
  observeMapContainer,
} from "@/lib/mapbox-init";
import {
  DEFAULT_MAP_VIEW,
  MAPBOX_TOKEN,
  mapboxStyleForTheme,
} from "@/lib/mapbox-style";

/** Login arka planı — etkileşimsiz, dashboard stiliyle aynı Mapbox haritası. */
export function LoginMapPreview() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageVeilRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleUrlRef = useRef<string | null>(null);
  const revealedRef = useRef(false);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    styleUrlRef.current = mapboxStyleForTheme(theme);
    const map = new mapboxgl.Map({
      container: containerRef.current,
      ...mapRenderOptions(theme),
      center: DEFAULT_MAP_VIEW.center,
      zoom: DEFAULT_MAP_VIEW.zoom,
      interactive: false,
      attributionControl: false,
      logoPosition: "bottom-left",
    });
    mapRef.current = map;
    const unobserveSize = observeMapContainer(map, containerRef.current);

    const onStyle = () => {
      applyMapRuntimeTuning(map, themeRef.current);
    };
    const onIdle = () => {
      if (revealedRef.current) return;
      revealedRef.current = true;
      revealStageVeil(stageVeilRef.current);
    };
    map.on("style.load", onStyle);
    map.on("idle", onIdle);

    return () => {
      unobserveSize();
      map.remove();
      mapRef.current = null;
    };
    // İlk kurulum — tema setStyle ile değişir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return <div className="size-full bg-background" aria-hidden />;
  }

  return (
    <div className="locus-map-stage size-full">
      <div ref={containerRef} className="size-full" aria-hidden />
      <div ref={stageVeilRef} className="locus-map-stage-veil" aria-hidden />
    </div>
  );
}
