"use client";

import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FinansalFiltersTipi {
  arama: string;
  temsilci: string | null;
}

export const EMPTY_FINANSAL_FILTERS: FinansalFiltersTipi = {
  arama: "",
  temsilci: null,
};

export function finansalFiltersActive(f: FinansalFiltersTipi): boolean {
  return f.arama.trim() !== "" || f.temsilci != null;
}

interface FinansalFiltersProps {
  filters: FinansalFiltersTipi;
  onChange: (filters: FinansalFiltersTipi) => void;
}

const FILTER_CONTROL = "h-9 min-w-0 rounded-md text-[13px] md:text-[13px]";

/**
 * Tek filtre satırı — arama açık fatura tablosunu daraltır; temsilci ise
 * grafikten (Donut dilimine tıklayarak) seçilir, burada yalnızca chip olarak
 * gösterilip temizlenebilir.
 */
export function FinansalFilters({ filters, onChange }: FinansalFiltersProps) {
  const aktif = finansalFiltersActive(filters);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3.5 py-2">
      <div className="relative min-w-0 flex-1 basis-56">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={filters.arama}
          onChange={(e) => onChange({ ...filters, arama: e.target.value })}
          placeholder="Müşteri adı veya kodu"
          aria-label="Açık faturalarda ara"
          className={cn(FILTER_CONTROL, "pl-8")}
        />
      </div>

      {filters.temsilci ? (
        <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-muted/50 px-2.5 text-[13px] text-foreground">
          {filters.temsilci}
          <button
            type="button"
            onClick={() => onChange({ ...filters, temsilci: null })}
            aria-label="Temsilci filtresini kaldır"
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : null}

      {aktif ? (
        <Button
          variant="ghost"
          size="lg"
          onClick={() => onChange(EMPTY_FINANSAL_FILTERS)}
          className={cn(FILTER_CONTROL, "px-2.5 text-muted-foreground")}
        >
          <XIcon className="size-3.5" aria-hidden />
          Temizle
        </Button>
      ) : null}
    </div>
  );
}
