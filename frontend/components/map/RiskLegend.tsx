import {
  HASSASIYET_LABELS,
  HASSASIYET_OPACITY,
  RISK_COLORS,
  RISK_LABELS as DEFAULT_RISK_LABELS,
  RISK_ORDER,
} from "@/lib/risk-style";
import {
  TIP_LABELS,
  TIP_ORDER,
  TIP_STROKE_COLORS,
} from "@/lib/tip-style";
import type { GeocodeHassasiyet, RiskDurumu } from "@/lib/types";
import { cn } from "@/lib/utils";

const HASSASIYET_ORDER: GeocodeHassasiyet[] = [
  "saha_gps",
  "mahalle_merkezi",
  "ilce_merkezi",
];

export function RiskLegend({
  className,
  showUpdatedRing = false,
  showTipRing = true,
  riskLabels = DEFAULT_RISK_LABELS,
  title = "Risk durumu",
}: {
  className?: string;
  showUpdatedRing?: boolean;
  /** Petshop / veteriner çevresel halka anahtarı. */
  showTipRing?: boolean;
  riskLabels?: Record<RiskDurumu, string>;
  title?: string;
}) {
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
            {title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {RISK_ORDER.map((risk) => (
              <li key={risk} className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[risk] }}
                />
                <span className="truncate text-[10px] text-foreground/80">
                  {riskLabels[risk]}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {showTipRing && (
          <div className="border-t border-border/50 pt-1.5">
            <p className="mb-1 text-[9px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Kanal
            </p>
            <ul className="flex flex-col gap-0.5">
              {TIP_ORDER.map((tip) => (
                <li key={tip} className="flex items-center gap-1.5">
                  <span
                    className="relative flex h-3 w-3 shrink-0 items-center justify-center"
                    aria-hidden
                  >
                    <span
                      className="absolute inset-0 rounded-full border-[1.5px]"
                      style={{ borderColor: TIP_STROKE_COLORS[tip] }}
                    />
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/55" />
                  </span>
                  <span className="truncate text-[10px] text-foreground/80">
                    {TIP_LABELS[tip]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {showUpdatedRing && (
          <div className="border-t border-border/50 pt-1.5">
            <p className="mb-1 text-[9px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Son yükleme
            </p>
            <ul className="flex flex-col gap-0.5">
              <li className="flex items-center gap-1.5">
                <span
                  className="relative flex h-3 w-3 shrink-0 items-center justify-center"
                  aria-hidden
                >
                  <span className="absolute inset-0 rounded-full border-[1.5px] border-foreground/90" />
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                </span>
                <span className="truncate text-[10px] text-foreground/80">
                  Etkilenen müşteri
                </span>
              </li>
            </ul>
          </div>
        )}
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
