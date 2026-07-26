"use client";

import type { ReactNode } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { RISK_COLORS, RISK_LABELS, RISK_ORDER } from "@/lib/risk-style";
import type { RiskDurumu } from "@/lib/types";

export interface FilterStats {
  toplam: number;
  gorunen: number;
  riskli: number;
}

interface FilterPanelProps {
  cities: string[];
  selectedCities: string[];
  onToggleCity: (city: string) => void;
  selectedRisks: RiskDurumu[];
  onToggleRisk: (risk: RiskDurumu) => void;
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
  selectedRisks,
  onToggleRisk,
  search,
  onSearchChange,
  stats,
  onReset,
  hasActiveFilters,
}: FilterPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="border-l-2 border-primary pl-2.5">
        <h1 className="font-mono text-sm font-semibold tracking-wide uppercase">
          Petshop Müşteri Haritası
        </h1>
        <p className="text-xs text-muted-foreground">
          Ege bölgesi müşteri dağılımı ve teslimat risk durumu
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Haritalı" value={stats.toplam} />
        <StatCard label="Görünen" value={stats.gorunen} />
        <StatCard label="Riskli" value={stats.riskli} accent={RISK_COLORS.riskli} />
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Müşteri adı veya kodu ara..."
          className="pl-8"
        />
      </div>

      <Separator />

      <div>
        <SectionLabel>Risk durumu</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {RISK_ORDER.map((risk) => (
            <RiskChip
              key={risk}
              risk={risk}
              active={selectedRisks.includes(risk)}
              onClick={() => onToggleRisk(risk)}
            />
          ))}
        </div>
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
              className="font-mono text-xs"
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
          className="gap-1.5 font-mono text-xs tracking-wide uppercase"
        >
          <XIcon className="size-3.5" />
          Filtreleri temizle
        </Button>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card
      size="sm"
      className="gap-0.5 border-t-2 py-2 text-center"
      style={{ borderTopColor: accent ?? "var(--primary)" }}
    >
      <CardContent className="px-2">
        <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}

function RiskChip({
  risk,
  active,
  onClick,
}: {
  risk: RiskDurumu;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="gap-1.5 font-mono text-xs"
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: RISK_COLORS[risk] }}
      />
      {RISK_LABELS[risk]}
    </Button>
  );
}
