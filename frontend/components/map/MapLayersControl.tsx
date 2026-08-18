"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BanknoteIcon,
  LayersIcon,
  PawPrintIcon,
  SparklesIcon,
  StethoscopeIcon,
  TruckIcon,
  type LucideIcon,
} from "lucide-react";

import { RISK_MODE_LABELS, type RiskMetricMode } from "@/lib/risk-mode";
import {
  TIP_LABELS,
  type TipKanalFilter,
  type TipKanalSecilebilir,
} from "@/lib/tip-style";
import { cn } from "@/lib/utils";

interface MapLayersControlProps {
  riskMode: RiskMetricMode;
  onRiskModeChange: (mode: RiskMetricMode) => void;
  tipFilter: TipKanalFilter;
  onTipFilterChange: (next: TipKanalFilter) => void;
  potansiyelActive: boolean;
  onPotansiyelChange: (active: boolean) => void;
  potansiyelCount?: number | null;
  potansiyelLoading?: boolean;
  className?: string;
}

/**
 * Google Maps katmanlar kontrolü — sol alt tetikleyici + yatay seçim paneli.
 * Mevcut Sevkiyat/Borç, Petshop/Veteriner, Potansiyel durumunu taşır.
 */
export function MapLayersControl({
  riskMode,
  onRiskModeChange,
  tipFilter,
  onTipFilterChange,
  potansiyelActive,
  onPotansiyelChange,
  potansiyelCount = null,
  potansiyelLoading = false,
  className,
}: MapLayersControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleKanal = (kanal: TipKanalSecilebilir) => {
    onTipFilterChange({ ...tipFilter, [kanal]: !tipFilter[kanal] });
  };

  return (
    <div
      ref={rootRef}
      className={cn("pointer-events-auto relative z-20", className)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Harita katmanları"
        onClick={() => setOpen((v) => !v)}
        className="group flex flex-col items-center gap-1 outline-none"
      >
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-[14px] border text-popover-foreground backdrop-blur-[18px] backdrop-saturate-150 transition-colors",
            "border-border/50 bg-popover/80 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.5)]",
            open
              ? "border-foreground/45"
              : "group-hover:border-foreground/30"
          )}
        >
          <LayersIcon className="size-[18px]" strokeWidth={1.75} />
        </span>
        <span className="text-[10px] font-medium tracking-tight text-foreground drop-shadow-sm">
          Katmanlar
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Katman seçimi"
          className={cn(
            "absolute z-20 flex items-stretch gap-0.5 rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur-sm",
            "bottom-[calc(100%+0.55rem)] left-0",
            "lg:bottom-0 lg:left-[calc(100%+0.5rem)]"
          )}
        >
          <LayerTile
            icon={TruckIcon}
            label={RISK_MODE_LABELS.sevkiyat}
            pressed={riskMode === "sevkiyat"}
            role="radio"
            onClick={() => onRiskModeChange("sevkiyat")}
          />
          <LayerTile
            icon={BanknoteIcon}
            label={RISK_MODE_LABELS.borc}
            pressed={riskMode === "borc"}
            role="radio"
            onClick={() => onRiskModeChange("borc")}
          />
          <span className="mx-0.5 my-1.5 w-px self-stretch bg-border/70" aria-hidden />
          <LayerTile
            icon={PawPrintIcon}
            label={TIP_LABELS.petshop}
            pressed={tipFilter.petshop}
            onClick={() => toggleKanal("petshop")}
          />
          <LayerTile
            icon={StethoscopeIcon}
            label={TIP_LABELS.veteriner}
            pressed={tipFilter.veteriner}
            onClick={() => toggleKanal("veteriner")}
          />
          <span className="mx-0.5 my-1.5 w-px self-stretch bg-border/70" aria-hidden />
          <LayerTile
            icon={SparklesIcon}
            label="Potansiyel"
            pressed={potansiyelActive}
            accent="teal"
            badge={
              potansiyelLoading
                ? "…"
                : potansiyelActive && potansiyelCount != null
                  ? String(potansiyelCount)
                  : null
            }
            onClick={() => onPotansiyelChange(!potansiyelActive)}
          />
        </div>
      ) : null}
    </div>
  );
}

function LayerTile({
  icon: Icon,
  label,
  pressed,
  onClick,
  role = "checkbox",
  accent,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  pressed: boolean;
  onClick: () => void;
  role?: "radio" | "checkbox";
  accent?: "teal";
  badge?: string | null;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={pressed}
      aria-pressed={role === "checkbox" ? pressed : undefined}
      onClick={onClick}
      className="flex w-[3.85rem] flex-col items-center gap-1 rounded-xl px-0.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          "relative flex size-10 items-center justify-center rounded-[0.7rem] border transition-colors",
          pressed && accent === "teal"
            ? "border-teal-500/55 bg-teal-500/15 text-teal-800 dark:text-teal-200"
            : pressed
              ? "border-foreground/25 bg-secondary text-foreground"
              : "border-border/70 bg-muted/35 text-muted-foreground hover:border-border hover:text-foreground"
        )}
      >
        <Icon className="size-[1.15rem]" strokeWidth={1.75} />
        {badge ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-card px-1 font-mono text-[8px] leading-4 tabular-nums text-muted-foreground shadow-sm ring-1 ring-border/70">
            {badge}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-[10px] leading-tight font-medium tracking-tight",
          pressed ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </button>
  );
}
