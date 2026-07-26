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
}

export function MobileFilterSheet(props: MobileFilterSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto rounded-full border shadow-md"
          />
        }
      >
        <MenuIcon />
        <span className="sr-only">Filtreleri aç</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0 sm:max-w-80">
        <SheetHeader className="sr-only">
          <SheetTitle>Filtreler</SheetTitle>
        </SheetHeader>
        <FilterPanel {...props} />
      </SheetContent>
    </Sheet>
  );
}
