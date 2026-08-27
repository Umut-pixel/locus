"use client";

import { AyarlarBolum } from "@/components/ayarlar/AyarlarBolum";
import { useCountUp } from "@/hooks/useCountUp";
import { useHaritaKapsami } from "@/hooks/useHaritaKapsami";
import { DEPOT } from "@/lib/depot";
import { formatNumber } from "@/lib/format";
import type { GeocodeHassasiyet } from "@/lib/types";
import { cn } from "@/lib/utils";

const HASSASIYET_KISA: Record<GeocodeHassasiyet, string> = {
  saha_gps: "Saha GPS",
  mahalle_merkezi: "Mahalle",
  ilce_merkezi: "İlçe",
};

const HASSASIYET_SIRA: GeocodeHassasiyet[] = [
  "saha_gps",
  "mahalle_merkezi",
  "ilce_merkezi",
];

export function HaritaDurumu() {
  const { data, loading, error } = useHaritaKapsami();
  const konumlanan = data?.konumlanan ?? 0;
  const toplam = data?.toplam ?? 0;
  const yuzde = toplam > 0 ? Math.round((konumlanan / toplam) * 100) : 0;
  const konumlananAnim = useCountUp(konumlanan);
  const toplamAnim = useCountUp(toplam);

  const [lon, lat] = DEPOT.lngLat;

  return (
    <AyarlarBolum id="harita" baslik="Harita">
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
        <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
          <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
            Konumlanan
          </span>
          <span
            className={cn(
              "font-sans text-[2rem] leading-none font-semibold tabular-nums transition-opacity",
              loading && !data && "opacity-40"
            )}
          >
            {data ? `${formatNumber(Math.round(konumlananAnim))}/${formatNumber(Math.round(toplamAnim))}` : "—"}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {data ? `%${yuzde} pin` : "musteriler_rapor"}
          </span>
        </div>
        {HASSASIYET_SIRA.map((k) => {
          const n = data?.hassasiyet[k] ?? 0;
          return (
            <div key={k} className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
              <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
                {HASSASIYET_KISA[k]}
              </span>
              <span
                className={cn(
                  "font-sans text-[2rem] leading-none font-semibold tabular-nums transition-opacity",
                  loading && !data && "opacity-40"
                )}
              >
                {data ? formatNumber(n) : "—"}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {konumlanan > 0 ? `%${Math.round((n / konumlanan) * 100)}` : "hassasiyet"}
              </span>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="border-b border-border px-3.5 py-2.5 text-[13px] text-red-400">{error}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-px border-b border-border bg-border sm:grid-cols-2">
        <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
          <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
            {DEPOT.label}
          </span>
          <span className="text-[13px] leading-snug text-foreground">{DEPOT.address}</span>
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {lat.toFixed(5)}, {lon.toFixed(4)}
          </span>
        </div>
        <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
          <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
            Geocode
          </span>
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Mahalle merkezi ve saha GPS. Sokak seviyesi yok; boş ilçe tahmin edilmez.
          </p>
        </div>
      </div>
    </AyarlarBolum>
  );
}
