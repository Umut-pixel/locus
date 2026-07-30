"use client";

import { memo, useId, type ReactNode } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { motion } from "motion/react";

import { AgentAssistant } from "@/components/agent/AgentAssistant";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Button } from "@/components/ui/button";
import { ClearDissolveInput } from "@/components/ui/clear-dissolve-input";
import { SegmentBar } from "@/components/ui/segment-bar";
import { cn } from "@/lib/utils";
import {
  RISK_COLORS,
  RISK_LABELS as DEFAULT_RISK_LABELS,
  RISK_ORDER,
  RISK_SHORT_LABELS as DEFAULT_RISK_SHORT_LABELS,
} from "@/lib/risk-style";
import type { ImportActivity } from "@/lib/agent-states";
import type { UploadResult } from "@/lib/import/types";
import type { RiskDurumu } from "@/lib/types";

export interface FilterStats {
  toplam: number;
  gorunen: number;
  riskli: number;
  dagilim: Record<RiskDurumu, number>;
}

interface FilterPanelProps {
  cities: string[];
  selectedCities: string[];
  onToggleCity: (city: string) => void;
  selectedRisk: RiskDurumu | null;
  onSelectRisk: (risk: RiskDurumu | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  stats: FilterStats;
  onReset: () => void;
  hasActiveFilters: boolean;
  importActivity?: ImportActivity | null;
  lastUploadResult?: UploadResult | null;
  /** Mobil sheet içinde farklı yükseklik/padding davranışı. */
  variant?: "sidebar" | "sheet";
  riskLabels?: Record<RiskDurumu, string>;
  riskShortLabels?: Record<RiskDurumu, string>;
}

export const FilterPanel = memo(function FilterPanel({
  cities,
  selectedCities,
  onToggleCity,
  selectedRisk,
  onSelectRisk,
  search,
  onSearchChange,
  stats,
  onReset,
  hasActiveFilters,
  importActivity = null,
  lastUploadResult = null,
  variant = "sidebar",
  riskLabels = DEFAULT_RISK_LABELS,
  riskShortLabels = DEFAULT_RISK_SHORT_LABELS,
}: FilterPanelProps) {
  const isSheet = variant === "sheet";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* A — Başlık → şehir */}
      <div
        className={cn(
          "flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-3",
          isSheet
            ? "flex-1 pt-12 pr-12"
            : "max-h-[48%] shrink-0 pt-5"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[15px] font-medium tracking-tight">
              Petshop Müşteri Haritası
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ege bölgesi müşteri dağılımı ve teslimat risk durumu
            </p>
          </div>
          {/* Sheet'te sağ üstte X ile çakışır — yalnızca masaüstü sidebar. */}
          {!isSheet ? (
            <LogoutButton className="shrink-0 text-muted-foreground" />
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Haritalı"
            value={stats.toplam}
            ratio={1}
            color="var(--muted-foreground)"
          />
          <StatTile
            label="Görünen"
            value={stats.gorunen}
            ratio={stats.toplam > 0 ? stats.gorunen / stats.toplam : 0}
            color="var(--foreground)"
          />
          <StatTile
            label="Riskli"
            value={stats.riskli}
            ratio={stats.gorunen > 0 ? stats.riskli / stats.gorunen : 0}
            color={RISK_COLORS.riskli}
          />
        </div>

        <ClearDissolveInput
          value={search}
          onChange={onSearchChange}
          placeholder="Müşteri adı veya kodu ara..."
          className="h-9 rounded-full border border-input bg-muted/35 text-xs"
          contentClassName="px-9 text-xs"
          startAdornment={
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 z-[4] size-3.5 -translate-y-1/2 text-muted-foreground" />
          }
          aria-label="Müşteri ara"
        />

        <div>
          <SectionLabel>Risk durumu</SectionLabel>
          <RiskSegmentedControl
            value={selectedRisk}
            onChange={onSelectRisk}
            shortLabels={riskShortLabels}
          />
          <RiskDagilim
            dagilim={stats.dagilim}
            gorunen={stats.gorunen}
            riskLabels={riskLabels}
          />
        </div>

        <div>
          <SectionLabel>Şehir</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {cities.map((city) => (
              <Button
                key={city}
                size="sm"
                variant={selectedCities.includes(city) ? "default" : "outline"}
                onClick={() => onToggleCity(city)}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {city}
              </Button>
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 gap-1.5 self-start rounded-full px-2 text-[11px]"
          >
            <XIcon className="size-3" />
            Filtreleri temizle
          </Button>
        )}

        {/* Sheet: sağ üst X ile çakışmasın — filtre listesinin altında. */}
        {isSheet ? (
          <LogoutButton
            showLabel
            className="mt-1 h-8 gap-1.5 self-start rounded-full px-2.5 text-[11px] text-muted-foreground"
          />
        ) : null}
      </div>

      {/* B — AI */}
      <div
        className={cn(
          "flex min-h-0 flex-col border-t border-sidebar-border/80 bg-black/20",
          isSheet ? "h-[min(42%,22rem)] shrink-0" : "flex-1"
        )}
      >
        <AgentAssistant
          importActivity={importActivity}
          lastUploadResult={lastUploadResult}
        />
      </div>
    </div>
  );
});

function RiskSegmentedControl({
  value,
  onChange,
  shortLabels = DEFAULT_RISK_SHORT_LABELS,
}: {
  value: RiskDurumu | null;
  onChange: (risk: RiskDurumu | null) => void;
  shortLabels?: Record<RiskDurumu, string>;
}) {
  const instanceId = useId();
  const options: { key: string; risk: RiskDurumu | null; label: string }[] = [
    { key: "all", risk: null, label: "Tümü" },
    ...RISK_ORDER.map((risk) => ({
      key: risk,
      risk: risk as RiskDurumu | null,
      label: shortLabels[risk],
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Risk durumu filtresi"
      className="flex w-full items-stretch rounded-full border bg-muted/35 p-0.5"
    >
      {options.map((option) => {
        const active = value === option.risk;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.risk)}
            className={cn(
              "relative min-w-0 flex-auto rounded-full px-0.5 py-1.5 text-[9px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-1 sm:text-[10px]",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={`risk-segment-${instanceId}`}
                className="absolute inset-0 rounded-full bg-secondary shadow-sm ring-1 ring-border"
                transition={{ type: "tween", duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RiskDagilim({
  dagilim,
  gorunen,
  riskLabels = DEFAULT_RISK_LABELS,
}: {
  dagilim: Record<RiskDurumu, number>;
  gorunen: number;
  riskLabels?: Record<RiskDurumu, string>;
}) {
  const TOTAL_BLOCKS = 24;
  const blocks: { risk: RiskDurumu; count: number }[] = [];
  if (gorunen > 0) {
    let used = 0;
    for (const risk of RISK_ORDER) {
      const exact = (dagilim[risk] / gorunen) * TOTAL_BLOCKS;
      const count = dagilim[risk] > 0 ? Math.max(1, Math.round(exact)) : 0;
      blocks.push({ risk, count });
      used += count;
    }
    let overflow = used - TOTAL_BLOCKS;
    while (overflow !== 0 && blocks.some((b) => b.count > 1)) {
      const biggest = blocks.reduce((a, b) => (b.count > a.count ? b : a));
      biggest.count -= Math.sign(overflow);
      overflow -= Math.sign(overflow);
    }
  }

  const colors: string[] = Array(TOTAL_BLOCKS).fill("var(--secondary)");
  let cursor = 0;
  for (const { risk, count } of blocks) {
    for (let i = 0; i < count && cursor < TOTAL_BLOCKS; i++) {
      colors[cursor++] = RISK_COLORS[risk];
    }
  }

  return (
    <div className="mt-2.5">
      <div className="flex gap-[2px]" role="img" aria-label="Risk dağılımı">
        {colors.map((color, i) => (
          <span
            key={i}
            className="h-1.5 min-w-0 flex-1 rounded-[1px] transition-colors duration-300 ease-out"
            style={{ backgroundColor: color, transitionDelay: `${Math.min(i, 12) * 8}ms` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {RISK_ORDER.map((risk) => (
          <span
            key={risk}
            title={`${riskLabels[risk]}: ${dagilim[risk]}`}
            className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk] }}
            />
            {dagilim[risk]}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function StatTile({
  label,
  value,
  ratio,
  color,
}: {
  label: string;
  value: number;
  ratio: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-2.5 py-2">
      <p className="text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-[15px] leading-none font-semibold tabular-nums">
        {value}
      </p>
      <SegmentBar className="mt-2" segments={8} value={ratio} color={color} />
    </div>
  );
}
