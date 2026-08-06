"use client";

import { useState } from "react";
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
import type { MusteriSearchHit } from "@/hooks/useMusteriSearch";
import type { ImportActivity } from "@/lib/agent-states";
import type { UploadResult } from "@/lib/import/types";
import type { RiskDurumu } from "@/lib/types";
import type { SonraBakItem } from "@/components/sidebar/PotansiyelFavoriList";

interface MobileFilterSheetProps {
  cities: string[];
  selectedCities: string[];
  onToggleCity: (city: string) => void;
  selectedRisk: RiskDurumu | null;
  onSelectRisk: (risk: RiskDurumu | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSelect: (hit: MusteriSearchHit) => void;
  stats: FilterStats;
  onReset: () => void;
  hasActiveFilters: boolean;
  importActivity?: ImportActivity | null;
  lastUploadResult?: UploadResult | null;
  riskLabels?: Record<RiskDurumu, string>;
  riskShortLabels?: Record<RiskDurumu, string>;
  includeDigerKanallar?: boolean;
  onIncludeDigerKanallarChange?: (value: boolean) => void;
  favoriler?: SonraBakItem[];
  favorilerLoading?: boolean;
  onlyFavoriler?: boolean;
  onOnlyFavorilerChange?: (value: boolean) => void;
  onFavoriSelect?: (entry: SonraBakItem) => void;
  gizlenen?: import("@/components/sidebar/GizlenenList").GizlenenItem[];
  gizlenenLoading?: boolean;
  gizlenenKodlari?: ReadonlySet<string>;
  onlyGizlenen?: boolean;
  onOnlyGizlenenChange?: (value: boolean) => void;
  onGizlenenSelect?: (
    entry: import("@/components/sidebar/GizlenenList").GizlenenItem
  ) => void;
}

export function MobileFilterSheet(props: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto size-10 rounded-full border shadow-md lg:size-8"
          />
        }
      >
        <MenuIcon />
        <span className="sr-only">Filtreleri aç</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        // Dar ekranda %100 olursa backdrop kalmaz; sağda boşluk bırak.
        className="h-dvh max-h-dvh w-[min(22.5rem,calc(100vw-3.25rem))] max-w-none gap-0 overflow-hidden p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] data-[side=left]:w-[min(22.5rem,calc(100vw-3.25rem))] sm:max-w-[22.5rem]"
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
