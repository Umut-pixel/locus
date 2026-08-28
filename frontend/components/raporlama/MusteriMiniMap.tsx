"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "@/components/theme/ThemeProvider";
import { mapRenderOptions } from "@/lib/mapbox-init";
import { MAPBOX_TOKEN, currentDocumentMapTheme } from "@/lib/mapbox-style";
import { RISK_COLORS } from "@/lib/risk-style";
import type { RiskDurumu } from "@/lib/types";

export function MusteriMiniMap({
  lat,
  lon,
  risk,
}: {
  lat: number;
  lon: number;
  risk: RiskDurumu;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      ...mapRenderOptions(currentDocumentMapTheme()),
      center: [lon, lat],
      zoom: 14,
      attributionControl: false,
    });

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    const el = document.createElement("div");
    el.style.cssText = `
      width: 13px; height: 13px; border-radius: 50%;
      background: ${RISK_COLORS[risk]};
      border: 2px solid rgba(255,255,255,0.85);
      box-shadow: 0 2px 6px rgba(0,0,0,0.55);
    `;

    new mapboxgl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);

    return () => {
      map.remove();
    };
  }, [lat, lon, risk, theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
