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
  EMPTY_STOK_FILTERS,
  stokFiltersActive,
  type StokFilters as StokFiltersTipi,
} from "@/hooks/useStokRaporu";
import { cn } from "@/lib/utils";

interface StokFiltersProps {
  filters: StokFiltersTipi;
  onChange: (filters: StokFiltersTipi) => void;
  markaSecenekleri: string[];
  kategoriSecenekleri: string[];
}

/** Müşteri raporlamasıyla aynı yoğunluk — 36px kontrol, 13px metin. */
const FILTER_CONTROL =
  "h-9 min-w-0 rounded-md text-[13px] md:text-[13px] [&>span]:truncate";

/** Select "tümü" seçeneği null'ı temsil eder; boş string Radix'te geçersiz. */
const TUMU = "__tumu__";

/**
 * Tek filtre satırı — tablo, dağılım grafiği ve KPI'ların hepsi bu slice'a
 * göre yeniden çiziliyor. Grafik kartının içine gömülü ayrı bir filtre yok.
 */
export function StokFilters({
  filters,
  onChange,
  markaSecenekleri,
  kategoriSecenekleri,
}: StokFiltersProps) {
  const aktif = stokFiltersActive(filters);

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
          placeholder="Ürün adı veya kodu"
          aria-label="Ürün ara"
          className={cn(FILTER_CONTROL, "pl-8")}
        />
      </div>

      <Select
        value={filters.marka ?? TUMU}
        onValueChange={(v) =>
          onChange({ ...filters, marka: v === TUMU ? null : v })
        }
      >
        <SelectTrigger className={cn(FILTER_CONTROL, "w-[9.5rem]")} aria-label="Marka">
          <SelectValue placeholder="Marka" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TUMU}>Tüm markalar</SelectItem>
          {markaSecenekleri.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.kategori ?? TUMU}
        onValueChange={(v) =>
          onChange({ ...filters, kategori: v === TUMU ? null : v })
        }
      >
        <SelectTrigger className={cn(FILTER_CONTROL, "w-[11rem]")} aria-label="Kategori">
          <SelectValue placeholder="Kategori" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TUMU}>Tüm kategoriler</SelectItem>
          {kategoriSecenekleri.map((k) => (
            <SelectItem key={k} value={k}>
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={filters.sadeceStoktaYok ? "destructive" : "outline"}
        size="lg"
        aria-pressed={filters.sadeceStoktaYok}
        onClick={() =>
          onChange({ ...filters, sadeceStoktaYok: !filters.sadeceStoktaYok })
        }
        className={cn(FILTER_CONTROL, "px-3")}
      >
        Stokta yok
      </Button>

      {aktif ? (
        <Button
          variant="ghost"
          size="lg"
          onClick={() => onChange(EMPTY_STOK_FILTERS)}
          className={cn(FILTER_CONTROL, "px-2.5 text-muted-foreground")}
        >
          <XIcon className="size-3.5" aria-hidden />
          Temizle
        </Button>
      ) : null}
    </div>
  );
}
