"use client";

import { useId, type ReactNode } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentBar } from "@/components/ui/segment-bar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  RISK_COLORS,
  RISK_LABELS,
  RISK_ORDER,
  RISK_SHORT_LABELS,
} from "@/lib/risk-style";
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
}

export function FilterPanel({
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
}: FilterPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto overscroll-contain p-3 sm:gap-5 sm:p-4">
      <div>
        <h1 className="text-sm font-medium">Petshop Müşteri Haritası</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ege bölgesi müşteri dağılımı ve teslimat risk durumu
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
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

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Müşteri adı veya kodu ara..."
          className="rounded-full bg-muted/40 pl-8.5"
        />
      </div>

      <Separator />

      <div>
        <SectionLabel>Risk durumu</SectionLabel>
        <RiskSegmentedControl value={selectedRisk} onChange={onSelectRisk} />
        <RiskDagilim dagilim={stats.dagilim} gorunen={stats.gorunen} />
      </div>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col">
        <SectionLabel>Şehir</SectionLabel>
        <div className="flex flex-wrap gap-1.5 overflow-y-auto">
          {cities.map((city) => (
            <Button
              key={city}
              size="sm"
              variant={selectedCities.includes(city) ? "default" : "outline"}
              onClick={() => onToggleCity(city)}
              className="rounded-full text-xs"
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
          className="gap-1.5 rounded-full text-xs"
        >
          <XIcon className="size-3.5" />
          Filtreleri temizle
        </Button>
      )}
    </div>
  );
}

/**
 * "Tümü + risk seviyeleri" segmentli pill filtre — aktif segmentin altındaki
 * highlight, Motion layoutId ile segmentler arasında kayarak taşınır.
 */
function RiskSegmentedControl({
  value,
  onChange,
}: {
  value: RiskDurumu | null;
  onChange: (risk: RiskDurumu | null) => void;
}) {
  // FilterPanel hem sidebar'da hem mobil sheet'te mount olabildiği için
  // layoutId'nin instance başına benzersiz olması gerekir.
  const instanceId = useId();
  const options: { key: string; risk: RiskDurumu | null; label: string }[] = [
    { key: "all", risk: null, label: "Tümü" },
    ...RISK_ORDER.map((risk) => ({
      key: risk,
      risk: risk as RiskDurumu | null,
      label: RISK_SHORT_LABELS[risk],
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Risk durumu filtresi"
      className="flex w-full items-stretch rounded-full border bg-muted/40 p-1"
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
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Görünen müşterilerin risk dağılımı — segmentli blok bar + sayımlar. */
function RiskDagilim({
  dagilim,
  gorunen,
}: {
  dagilim: Record<RiskDurumu, number>;
  gorunen: number;
}) {
  const TOTAL_BLOCKS = 24;

  // Sayıları blok sayısına dağıt; yuvarlama artıklarını en büyük paya ekle.
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

  // Blok sayısı ve DOM sırası sabit; filtre değişince yalnızca renkler değişir,
  // geçiş CSS transition + kademeli delay ile soldan sağa dalga olarak animasyonlanır.
  const colors: string[] = Array(TOTAL_BLOCKS).fill("var(--secondary)");
  let cursor = 0;
  for (const { risk, count } of blocks) {
    for (let i = 0; i < count && cursor < TOTAL_BLOCKS; i++) {
      colors[cursor++] = RISK_COLORS[risk];
    }
  }

  return (
    <div className="mt-3">
      <div className="flex gap-[3px]" role="img" aria-label="Risk dağılımı">
        {colors.map((color, i) => (
          <span
            key={i}
            className="h-2 min-w-0 flex-1 rounded-[1.5px] transition-colors duration-300 ease-out"
            style={{ backgroundColor: color, transitionDelay: `${i * 12}ms` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {RISK_ORDER.map((risk) => (
          <span
            key={risk}
            title={`${RISK_LABELS[risk]}: ${dagilim[risk]}`}
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
    <p className="mb-2.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
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
    <div className="rounded-xl border bg-muted/30 p-2 sm:p-2.5">
      <p className="text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase sm:text-[10px]">
        {label}
      </p>
      <p className="mt-1 font-mono text-base leading-none font-semibold tabular-nums sm:text-lg">
        {value}
      </p>
      <SegmentBar className="mt-2" segments={8} value={ratio} color={color} />
    </div>
  );
}
