"use client";

import {
  TIP_LABELS,
  TIP_ORDER,
  type TipKanalFilter,
  type TipKanalSecilebilir,
} from "@/lib/tip-style";
import { cn } from "@/lib/utils";

interface TipKanalToggleProps {
  value: TipKanalFilter;
  onChange: (next: TipKanalFilter) => void;
  className?: string;
}

/** Harita — petshop / veteriner çoklu seçim (ikisi birden açık olabilir). */
export function TipKanalToggle({
  value,
  onChange,
  className,
}: TipKanalToggleProps) {
  const toggle = (kanal: TipKanalSecilebilir) => {
    onChange({ ...value, [kanal]: !value[kanal] });
  };

  return (
    <div
      role="group"
      aria-label="Müşteri kanalı"
      className={cn(
        "pointer-events-auto flex overflow-hidden rounded-lg border border-border/80 bg-card/92 shadow-md backdrop-blur-sm",
        className
      )}
    >
      {TIP_ORDER.map((kanal) => {
        const active = value[kanal];
        return (
          <button
            key={kanal}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(kanal)}
            className={cn(
              "h-10 min-w-[4.25rem] px-2.5 text-[12px] font-medium tracking-tight transition-colors lg:h-8 lg:min-w-[4.5rem] lg:text-[11px]",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {TIP_LABELS[kanal]}
          </button>
        );
      })}
    </div>
  );
}
