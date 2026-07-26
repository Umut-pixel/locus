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
        "pointer-events-auto rounded-xl border border-border/80 bg-card/92 text-card-foreground shadow-[0_8px_24px_-14px_rgba(0,0,0,0.55)] backdrop-blur-sm",
        "w-[min(100%,11.5rem)] px-2.5 py-2 sm:w-44",
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <div>
          <p className="mb-1 text-[9px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Risk durumu
          </p>
          <ul className="flex flex-col gap-0.5">
            {RISK_ORDER.map((risk) => (
              <li key={risk} className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[risk] }}
                />
                <span className="truncate text-[10px] text-foreground/80">
                  {RISK_LABELS[risk]}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden border-t border-border/50 pt-1.5 min-[380px]:block">
          <p className="mb-1 text-[9px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Konum hassasiyeti
          </p>
          <ul className="flex flex-col gap-0.5">
            {HASSASIYET_ORDER.map((h) => (
              <li key={h} className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                  style={{ opacity: HASSASIYET_OPACITY[h] }}
                />
                <span className="truncate text-[10px] text-foreground/80">
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
