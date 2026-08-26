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
  BORC_GECIKME_BANTLARI,
  EMPTY_RAPORLAMA_FILTERS,
  raporlamaFiltersActive,
  useIlceSecenekleri,
  useSehirSecenekleri,
  useTemsilciSecenekleri,
  type RaporlamaFilters,
  type RaporlamaSort,
} from "@/hooks/useMusteriRaporlama";
import { SEGMENT_OPTIONS, segmentDisplayLabel } from "@/lib/raporlama-style";
import { riskShortLabelsForMode, type RiskMetricMode } from "@/lib/risk-mode";
import { RISK_ORDER } from "@/lib/risk-style";
import type { RiskDurumu } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Araç çubuğu tek satırda kalsın diye tüm kontroller aynı yoğunlukta:
 * 30px yükseklik, 6px köşe, 12px metin — tabloyla aynı görsel density.
 * min-w-0 + truncate: dar viewport'ta alt satıra sarmak yerine sıkışsınlar.
 */
// md:text-[13px] gerekli: Input'un kendi `md:text-sm` varyantı, media-query
// olduğu için düz `text-[13px]`i cascade'de geçiyor.
// 2026-08-10: ilk yoğun geçişten (26px/12px) sonra "çok dar" geri bildirimiyle ~%20 büyütüldü.
const FILTER_CONTROL =
  "h-9 min-w-0 rounded-md text-[13px] md:text-[13px] [&>span]:truncate";

/**
 * Sırala dropdown'unun tek-string kodlaması ↔ {alan, yön} çifti.
 * `label` açılır listede, `short` tetikleyicide görünür — yoğun araç
 * çubuğunda tam etiket ("Açık Bakiye: Yüksek → Düşük") satırı taşırıyor.
 */
const SORT_SECENEKLERI: {
  value: string;
  label: string;
  short: string;
  sort: RaporlamaSort | null;
}[] = [
  { value: "default", label: "Varsayılan sıralama", short: "Sıralama", sort: null },
  {
    value: "ciro_desc",
    label: "Ciro: Yüksek → Düşük",
    short: "Ciro: yüksek",
    sort: { alan: "ciro", yon: "desc" },
  },
  {
    value: "ciro_asc",
    label: "Ciro: Düşük → Yüksek",
    short: "Ciro: düşük",
    sort: { alan: "ciro", yon: "asc" },
  },
  {
    value: "acik_bakiye_desc",
    label: "Açık Bakiye: Yüksek → Düşük",
    short: "Bakiye: yüksek",
    sort: { alan: "acik_bakiye", yon: "desc" },
  },
  {
    value: "acik_bakiye_asc",
    label: "Açık Bakiye: Düşük → Yüksek",
    short: "Bakiye: düşük",
    sort: { alan: "acik_bakiye", yon: "asc" },
  },
];

function sortToValue(sort: RaporlamaSort | null): string {
  if (!sort) return "default";
  return `${sort.alan}_${sort.yon}`;
}

interface MusteriRaporlamaFiltersProps {
  filters: RaporlamaFilters;
  onChange: (next: RaporlamaFilters) => void;
  sort: RaporlamaSort | null;
  onSortChange: (next: RaporlamaSort | null) => void;
  onExport: () => void;
  exporting: boolean;
  selectedCount: number;
  riskMode: RiskMetricMode;
}

export function MusteriRaporlamaFilters({
  filters,
  onChange,
  sort,
  onSortChange,
  onExport,
  exporting,
  selectedCount,
  riskMode,
}: MusteriRaporlamaFiltersProps) {
  const { options: temsilciOptions } = useTemsilciSecenekleri();
  const { options: sehirOptions } = useSehirSecenekleri();
  const { options: ilceOptions } = useIlceSecenekleri(filters.sehir);
  const active = raporlamaFiltersActive(filters);
  const riskLabels = riskShortLabelsForMode(riskMode);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5 lg:flex-nowrap">
      <div className="relative min-w-[9rem] flex-1 sm:max-w-[17rem]">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Unvan veya müşteri kodu ara…"
          className={cn(FILTER_CONTROL, "w-full pl-8")}
        />
      </div>

      <Select
        value={sortToValue(sort)}
        onValueChange={(v) => {
          const found = SORT_SECENEKLERI.find((s) => s.value === v);
          onSortChange(found ? found.sort : null);
        }}
      >
        <SelectTrigger size="sm" className={cn(FILTER_CONTROL, "w-[9rem]")}>
          <SelectValue>
            {(v: string) =>
              SORT_SECENEKLERI.find((s) => s.value === v)?.short ?? "Sıralama"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_SECENEKLERI.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.risk ?? "all"}
        onValueChange={(v) =>
          onChange({ ...filters, risk: v === "all" ? null : (v as RaporlamaFilters["risk"]) })
        }
      >
        <SelectTrigger size="sm" className={cn(FILTER_CONTROL, "w-[7.5rem]")}>
          <SelectValue>
            {(v: string) => (v === "all" ? "Risk" : riskLabels[v as RiskDurumu])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm risk durumları</SelectItem>
          {RISK_ORDER.map((risk) => (
            <SelectItem key={risk} value={risk}>
              {riskLabels[risk]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.segment ?? "all"}
        onValueChange={(v) => onChange({ ...filters, segment: v === "all" ? null : v })}
      >
        <SelectTrigger size="sm" className={cn(FILTER_CONTROL, "w-[8rem]")}>
          <SelectValue>
            {(v: string) => (v === "all" ? "Segment" : segmentDisplayLabel(v))}
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
        <SelectTrigger size="sm" className={cn(FILTER_CONTROL, "w-[8.5rem]")}>
          <SelectValue>{(v: string) => (v === "all" ? "Temsilci" : v)}</SelectValue>
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
        <SelectTrigger size="sm" className={cn(FILTER_CONTROL, "w-[6.75rem]")}>
          <SelectValue>{(v: string) => (v === "all" ? "İl" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm iller</SelectItem>
          {sehirOptions.map((sehir) => (
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
        <SelectTrigger size="sm" className={cn(FILTER_CONTROL, "w-[7.25rem]")}>
          <SelectValue>{(v: string) => (v === "all" ? "İlçe" : v)}</SelectValue>
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

      <Select
        value={filters.gecikmeBandi ?? "all"}
        onValueChange={(v) =>
          onChange({ ...filters, gecikmeBandi: v === "all" ? null : v })
        }
      >
        <SelectTrigger size="sm" className={cn(FILTER_CONTROL, "w-[8.25rem]")}>
          <SelectValue>
            {(v: string) =>
              v === "all"
                ? "Gecikme"
                : BORC_GECIKME_BANTLARI.find((b) => b.value === v)?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm gecikme bantları</SelectItem>
          {BORC_GECIKME_BANTLARI.map((bant) => (
            <SelectItem key={bant.value} value={bant.value}>
              {bant.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            className={cn(FILTER_CONTROL, "gap-1.5 px-2.5 text-muted-foreground")}
            onClick={() => onChange(EMPTY_RAPORLAMA_FILTERS)}
          >
            <XIcon className="size-3.5" />
            Temizle
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className={cn(FILTER_CONTROL, "gap-2 px-3")}
          onClick={onExport}
          disabled={exporting}
        >
          <DownloadIcon className="size-3.5" />
          {exporting
            ? "Hazırlanıyor…"
            : selectedCount > 0
              ? `${selectedCount} seçiliyi aktar`
              : "Dışa aktar"}
        </Button>
      </div>
    </div>
  );
}
