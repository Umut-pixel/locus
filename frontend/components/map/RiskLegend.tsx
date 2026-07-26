import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="pointer-events-auto w-56 gap-3 border-t-2 border-t-primary py-3 shadow-lg">
      <CardContent className="flex flex-col gap-3 px-3">
        <div>
          <p className="mb-1.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Risk durumu
          </p>
          <ul className="flex flex-col gap-1">
            {RISK_ORDER.map((risk) => (
              <li key={risk} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[risk] }}
                />
                <span className="font-mono text-[11px]">{RISK_LABELS[risk]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Konum hassasiyeti
          </p>
          <ul className="flex flex-col gap-1">
            {HASSASIYET_ORDER.map((h) => (
              <li key={h} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground"
                  style={{ opacity: HASSASIYET_OPACITY[h] }}
                />
                <span className="font-mono text-[11px]">{HASSASIYET_LABELS[h]}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
