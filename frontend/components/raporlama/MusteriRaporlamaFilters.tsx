"use client";

import { DownloadIcon, SearchIcon, XIcon } from "lucide-react";

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
  EMPTY_RAPORLAMA_FILTERS,
  raporlamaFiltersActive,
  useIlceSecenekleri,
  useTemsilciSecenekleri,
  type RaporlamaFilters,
} from "@/hooks/useMusteriRaporlama";
import { SEHIR_HEDEF } from "@/lib/import/cities";
import { SEGMENT_OPTIONS, segmentDisplayLabel } from "@/lib/raporlama-style";
import { RISK_ORDER, RISK_SHORT_LABELS } from "@/lib/risk-style";
import type { RiskDurumu } from "@/lib/types";

const SEHIR_OPTIONS = Array.from(SEHIR_HEDEF).sort((a, b) => a.localeCompare(b, "tr"));

interface MusteriRaporlamaFiltersProps {
  filters: RaporlamaFilters;
  onChange: (next: RaporlamaFilters) => void;
  onExport: () => void;
  exporting: boolean;
}

export function MusteriRaporlamaFilters({
  filters,
  onChange,
  onExport,
  exporting,
}: MusteriRaporlamaFiltersProps) {
  const { options: temsilciOptions } = useTemsilciSecenekleri();
  const { options: ilceOptions } = useIlceSecenekleri(filters.sehir);
  const active = raporlamaFiltersActive(filters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3 sm:px-6">
      <div className="relative min-w-[11rem] flex-1 sm:max-w-[16rem]">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Unvan veya müşteri kodu ara…"
          className="h-8 pl-8 text-[13px]"
        />
      </div>

      <Select
        value={filters.risk ?? "all"}
        onValueChange={(v) =>
          onChange({ ...filters, risk: v === "all" ? null : (v as RaporlamaFilters["risk"]) })
        }
      >
        <SelectTrigger size="sm" className="w-[9.5rem]">
          <SelectValue>
            {(v: string) => (v === "all" ? "Tüm risk durumları" : RISK_SHORT_LABELS[v as RiskDurumu])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm risk durumları</SelectItem>
          {RISK_ORDER.map((risk) => (
            <SelectItem key={risk} value={risk}>
              {RISK_SHORT_LABELS[risk]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.segment ?? "all"}
        onValueChange={(v) => onChange({ ...filters, segment: v === "all" ? null : v })}
      >
        <SelectTrigger size="sm" className="w-[9rem]">
          <SelectValue>
            {(v: string) => (v === "all" ? "Tüm segmentler" : segmentDisplayLabel(v))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm segmentler</SelectItem>
          {SEGMENT_OPTIONS.map((seg) => (
            <SelectItem key={seg} value={seg}>
              {segmentDisplayLabel(seg)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.temsilci ?? "all"}
        onValueChange={(v) => onChange({ ...filters, temsilci: v === "all" ? null : v })}
      >
        <SelectTrigger size="sm" className="w-[9.5rem]">
          <SelectValue>{(v: string) => (v === "all" ? "Tüm temsilciler" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm temsilciler</SelectItem>
          {temsilciOptions.map((ad) => (
            <SelectItem key={ad} value={ad}>
              {ad}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sehir ?? "all"}
        onValueChange={(v) =>
          onChange({ ...filters, sehir: v === "all" ? null : v, ilce: null })
        }
      >
        <SelectTrigger size="sm" className="w-[8rem]">
          <SelectValue>{(v: string) => (v === "all" ? "Tüm iller" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm iller</SelectItem>
          {SEHIR_OPTIONS.map((sehir) => (
            <SelectItem key={sehir} value={sehir}>
              {sehir}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.ilce ?? "all"}
        onValueChange={(v) => onChange({ ...filters, ilce: v === "all" ? null : v })}
      >
        <SelectTrigger size="sm" className="w-[8.5rem]">
          <SelectValue>{(v: string) => (v === "all" ? "Tüm ilçeler" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm ilçeler</SelectItem>
          {ilceOptions.map((ilce) => (
            <SelectItem key={ilce} value={ilce}>
              {ilce}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-[12px] text-muted-foreground"
            onClick={() => onChange(EMPTY_RAPORLAMA_FILTERS)}
          >
            <XIcon className="size-3.5" />
            Temizle
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={onExport}
          disabled={exporting}
        >
          <DownloadIcon className="size-3.5" />
          {exporting ? "Hazırlanıyor…" : "Dışa aktar"}
        </Button>
      </div>
    </div>
  );
}
