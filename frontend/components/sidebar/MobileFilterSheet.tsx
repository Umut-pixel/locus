"use client";

import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterPanel, type FilterStats } from "@/components/sidebar/FilterPanel";
import type { ImportActivity } from "@/lib/agent-states";
import type { UploadResult } from "@/lib/import/types";
import type { RiskDurumu } from "@/lib/types";

interface MobileFilterSheetProps {
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
  riskLabels?: Record<RiskDurumu, string>;
  riskShortLabels?: Record<RiskDurumu, string>;
}

export function MobileFilterSheet(props: MobileFilterSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto size-9 rounded-full border shadow-md sm:size-8"
          />
        }
      >
        <MenuIcon />
        <span className="sr-only">Filtreleri aç</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="h-dvh max-h-dvh w-[min(22.5rem,100%)] max-w-none gap-0 overflow-hidden p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] data-[side=left]:w-[min(22.5rem,100%)] sm:max-w-[22.5rem]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Filtreler</SheetTitle>
        </SheetHeader>
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <FilterPanel {...props} variant="sheet" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
