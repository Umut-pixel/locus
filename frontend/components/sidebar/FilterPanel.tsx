"use client";

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
      <div>
        <h1 className="text-lg font-semibold">Petshop Müşteri Haritası</h1>
        <p className="text-sm text-muted-foreground">
          Ege bölgesi müşteri dağılımı ve teslimat risk durumu
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Haritalı" value={stats.toplam} />
        <StatCard label="Görünen" value={stats.gorunen} />
        <StatCard label="Riskli" value={stats.riskli} />
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
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Risk durumu
        </p>
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
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Şehir
        </p>
        <div className="flex flex-wrap gap-1.5 overflow-y-auto">
          {cities.map((city) => (
            <Button
              key={city}
              size="sm"
              variant={selectedCities.includes(city) ? "default" : "outline"}
              onClick={() => onToggleCity(city)}
              className="text-xs"
            >
              {city}
            </Button>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5">
          <XIcon className="size-3.5" />
          Filtreleri temizle
        </Button>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm" className="gap-0.5 py-2 text-center">
      <CardContent className="px-2">
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
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
      className="gap-1.5 text-xs"
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: RISK_COLORS[risk] }}
      />
      {RISK_LABELS[risk]}
    </Button>
  );
}
