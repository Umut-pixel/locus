import {
  HASSASIYET_LABELS,
  HASSASIYET_OPACITY,
  RISK_COLORS,
  RISK_LABELS,
  RISK_ORDER,
} from "@/lib/risk-style";
import type { GeocodeHassasiyet } from "@/lib/types";
import { cn } from "@/lib/utils";

const HASSASIYET_ORDER: GeocodeHassasiyet[] = [
  "saha_gps",
  "mahalle_merkezi",
  "ilce_merkezi",
];

export function RiskLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-2xl border bg-card text-card-foreground shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]",
        // Mobil: dar, sıkı; sm+: klasik w-56 dikey kart
        "w-[min(100%,13.5rem)] p-2.5 sm:w-56 sm:p-4",
        className
      )}
    >
      <div className="flex flex-col gap-2.5 sm:gap-4">
        <div>
          <p className="mb-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:mb-2">
            Risk durumu
          </p>
          <ul className="flex flex-col gap-1 sm:gap-1.5">
            {RISK_ORDER.map((risk) => (
              <li key={risk} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[risk] }}
                />
                <span className="truncate text-[10px] text-foreground/85 sm:text-[11px]">
                  {RISK_LABELS[risk]}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {/* Konum hassasiyeti: çok dar ekranda gizle — harita alanı kalsın */}
        <div className="hidden min-[380px]:block">
          <p className="mb-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:mb-2">
            Konum hassasiyeti
          </p>
          <ul className="flex flex-col gap-1 sm:gap-1.5">
            {HASSASIYET_ORDER.map((h) => (
              <li key={h} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-foreground"
                  style={{ opacity: HASSASIYET_OPACITY[h] }}
                />
                <span className="truncate text-[10px] text-foreground/85 sm:text-[11px]">
                  {HASSASIYET_LABELS[h]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
