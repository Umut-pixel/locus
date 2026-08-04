"use client";

import { cn } from "@/lib/utils";

interface PotansiyelLayerToggleProps {
  active: boolean;
  onChange: (active: boolean) => void;
  count?: number | null;
  loading?: boolean;
  className?: string;
}

/** Harita overlay — potansiyel (Places) katmanı aç/kapa. */
export function PotansiyelLayerToggle({
  active,
  onChange,
  count = null,
  loading = false,
  className,
}: PotansiyelLayerToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label="Potansiyel müşteri katmanı"
      onClick={() => onChange(!active)}
      className={cn(
        "pointer-events-auto flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-2.5 text-[11px] font-medium tracking-tight shadow-md backdrop-blur-sm transition-colors",
        active
          ? "border-teal-500/50 bg-teal-500/15 text-teal-800 dark:text-teal-200"
          : "bg-card/92 text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          active ? "bg-teal-400" : "bg-muted-foreground/50"
        )}
      />
      <span>Potansiyel</span>
      {loading ? (
        <span className="font-mono text-[10px] opacity-70">…</span>
      ) : count != null && active ? (
        <span className="font-mono text-[10px] tabular-nums opacity-80">
          {count}
        </span>
      ) : null}
    </button>
  );
}
