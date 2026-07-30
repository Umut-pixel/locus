"use client";

import { RISK_MODE_LABELS, type RiskMetricMode } from "@/lib/risk-mode";
import { cn } from "@/lib/utils";

interface RiskModeToggleProps {
  value: RiskMetricMode;
  onChange: (mode: RiskMetricMode) => void;
  className?: string;
}

const OPTIONS: RiskMetricMode[] = ["sevkiyat", "borc"];

/** Harita zoom kontrollerinin yanında sağlık metriği seçici. */
export function RiskModeToggle({
  value,
  onChange,
  className,
}: RiskModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Sağlık durumu metriği"
      className={cn(
        "pointer-events-auto flex overflow-hidden rounded-lg border border-border/80 bg-card/92 shadow-md backdrop-blur-sm",
        className
      )}
    >
      {OPTIONS.map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={cn(
              "h-8 min-w-[3.75rem] px-2 text-[11px] font-medium tracking-tight transition-colors sm:min-w-[4.5rem] sm:px-2.5",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {RISK_MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
