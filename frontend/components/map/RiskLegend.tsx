import {
  HASSASIYET_LABELS,
  HASSASIYET_OPACITY,
  RISK_COLORS,
  RISK_LABELS,
  RISK_ORDER,
} from "@/lib/risk-style";
import type { GeocodeHassasiyet } from "@/lib/types";

const HASSASIYET_ORDER: GeocodeHassasiyet[] = [
  "saha_gps",
  "mahalle_merkezi",
  "ilce_merkezi",
];

export function RiskLegend() {
  return (
    <div className="pointer-events-auto w-56 rounded-2xl border bg-card p-4 text-card-foreground shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]">
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Risk durumu
          </p>
          <ul className="flex flex-col gap-1.5">
            {RISK_ORDER.map((risk) => (
              <li key={risk} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[risk] }}
                />
                <span className="text-[11px] text-foreground/85">
                  {RISK_LABELS[risk]}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Konum hassasiyeti
          </p>
          <ul className="flex flex-col gap-1.5">
            {HASSASIYET_ORDER.map((h) => (
              <li key={h} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-foreground"
                  style={{ opacity: HASSASIYET_OPACITY[h] }}
                />
                <span className="text-[11px] text-foreground/85">
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
