"use client";

import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPTY_TAHSILAT_FILTERS,
  tahsilatFiltersActive,
  type TahsilatFilters as TahsilatFiltersTipi,
} from "@/hooks/useTahsilatRaporu";
import { cn } from "@/lib/utils";

interface TahsilatFiltersProps {
  filters: TahsilatFiltersTipi;
  onChange: (filters: TahsilatFiltersTipi) => void;
  turSecenekleri: string[];
  temsilciSecenekleri: string[];
  durumSecenekleri: string[];
}

const FILTER_CONTROL =
  "h-9 min-w-0 rounded-md text-[13px] md:text-[13px] [&>span]:truncate";
const TUMU = "__tumu__";

export function TahsilatFilters({
  filters,
  onChange,
  turSecenekleri,
  temsilciSecenekleri,
  durumSecenekleri,
}: TahsilatFiltersProps) {
  const aktif = tahsilatFiltersActive(filters);

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
          placeholder="Müşteri, kod veya belge"
          aria-label="Tahsilatta ara"
          className={cn(FILTER_CONTROL, "pl-8")}
        />
      </div>

      <Select
        value={filters.tur ?? TUMU}
        onValueChange={(v) =>
          onChange({ ...filters, tur: v === TUMU ? null : v })
        }
      >
        <SelectTrigger className={cn(FILTER_CONTROL, "w-[11rem]")} aria-label="Tür">
          <SelectValue placeholder="Tür" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TUMU}>Tüm türler</SelectItem>
          {turSecenekleri.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.temsilci ?? TUMU}
        onValueChange={(v) =>
          onChange({ ...filters, temsilci: v === TUMU ? null : v })
        }
      >
        <SelectTrigger
          className={cn(FILTER_CONTROL, "w-[12rem]")}
          aria-label="Temsilci"
        >
          <SelectValue placeholder="Temsilci" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TUMU}>Tüm temsilciler</SelectItem>
          {temsilciSecenekleri.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.durum ?? TUMU}
        onValueChange={(v) =>
          onChange({ ...filters, durum: v === TUMU ? null : v })
        }
      >
        <SelectTrigger className={cn(FILTER_CONTROL, "w-[9.5rem]")} aria-label="Durum">
          <SelectValue placeholder="Durum" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TUMU}>Tüm durumlar</SelectItem>
          {durumSecenekleri.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {aktif ? (
        <Button
          variant="ghost"
          size="lg"
          onClick={() => onChange(EMPTY_TAHSILAT_FILTERS)}
          className={cn(FILTER_CONTROL, "px-2.5 text-muted-foreground")}
        >
          <XIcon className="size-3.5" aria-hidden />
          Temizle
        </Button>
      ) : null}
    </div>
  );
}
