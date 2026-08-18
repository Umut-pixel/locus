"use client";

import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SearchIcon, EyeOffIcon, XIcon } from "lucide-react";
import { motion } from "motion/react";
import { Typography } from "@heroui/react";

import {
  GizlenenList,
  type GizlenenItem,
} from "@/components/sidebar/GizlenenList";
import { PotansiyelFavoriList } from "@/components/sidebar/PotansiyelFavoriList";
import type { SonraBakItem } from "@/components/sidebar/PotansiyelFavoriList";
import { Button } from "@/components/ui/button";
import { ClearDissolveInput } from "@/components/ui/clear-dissolve-input";
import { SegmentBar } from "@/components/ui/segment-bar";
import {
  useMusteriSearch,
  type MusteriSearchHit,
} from "@/hooks/useMusteriSearch";
import { cn } from "@/lib/utils";
import {
  RISK_COLORS,
  RISK_LABELS as DEFAULT_RISK_LABELS,
  RISK_ORDER,
  RISK_SHORT_LABELS as DEFAULT_RISK_SHORT_LABELS,
} from "@/lib/risk-style";
import type { PotansiyelHarita, RiskDurumu } from "@/lib/types";

export interface FilterStats {
  toplam: number;
  gorunen: number;
  riskli: number;
  dagilim: Record<RiskDurumu, number>;
}

type SearchListItem =
  | { kind: "musteri"; hit: MusteriSearchHit }
  | { kind: "potansiyel"; hit: PotansiyelHarita };

const POTANSIYEL_SEARCH_LIMIT = 10;

function matchPotansiyel(p: PotansiyelHarita, q: string): boolean {
  const hay = [p.isim ?? "", p.adres ?? "", p.ilce ?? "", p.il ?? "", p.kaynak_id ?? ""]
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  return hay.includes(q);
}

interface FilterPanelProps {
  cities: string[];
  selectedCities: string[];
  onToggleCity: (city: string) => void;
  selectedRisk: RiskDurumu | null;
  onSelectRisk: (risk: RiskDurumu | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSelect: (hit: MusteriSearchHit) => void;
  /** Potansiyel katmanı açıkken arama sonuçlarına adaylar eklenir. */
  showPotansiyel?: boolean;
  potansiyelRows?: PotansiyelHarita[];
  potansiyelLoading?: boolean;
  potansiyelGizlenenIds?: ReadonlySet<string>;
  onPotansiyelSearchSelect?: (hit: PotansiyelHarita) => void;
  stats: FilterStats;
  onReset: () => void;
  hasActiveFilters: boolean;
  /** sidebar: sabit kolon; sheet: mobil çekmece; overlay: harita üstü arama + kart. */
  variant?: "sidebar" | "sheet" | "overlay";
  riskLabels?: Record<RiskDurumu, string>;
  riskShortLabels?: Record<RiskDurumu, string>;
  /** YEM TOPTAN vb. diğer kanalları haritada göster (varsayılan kapalı). */
  includeDigerKanallar?: boolean;
  onIncludeDigerKanallarChange?: (value: boolean) => void;
  favoriler?: SonraBakItem[];
  favorilerLoading?: boolean;
  onlyFavoriler?: boolean;
  onOnlyFavorilerChange?: (value: boolean) => void;
  onFavoriSelect?: (entry: SonraBakItem) => void;
  gizlenen?: GizlenenItem[];
  gizlenenLoading?: boolean;
  gizlenenKodlari?: ReadonlySet<string>;
  onlyGizlenen?: boolean;
  onOnlyGizlenenChange?: (value: boolean) => void;
  onGizlenenSelect?: (entry: GizlenenItem) => void;
  /** overlay: arama çubuğunun sağındaki birleşik eylem (ör. veri yükle). */
  overlayAction?: {
    pressed?: boolean;
    onClick: () => void;
    label?: string;
  };
  /** overlay: arama çubuğunun solundaki eylem (ör. mobil hamburger). */
  overlayLeading?: ReactNode;
}

export const FilterPanel = memo(function FilterPanel({
  cities,
  selectedCities,
  onToggleCity,
  selectedRisk,
  onSelectRisk,
  search,
  onSearchChange,
  onSearchSelect,
  showPotansiyel = false,
  potansiyelRows = [],
  potansiyelLoading = false,
  potansiyelGizlenenIds,
  onPotansiyelSearchSelect,
  stats,
  onReset,
  hasActiveFilters,
  variant = "sidebar",
  riskLabels = DEFAULT_RISK_LABELS,
  riskShortLabels = DEFAULT_RISK_SHORT_LABELS,
  includeDigerKanallar = false,
  onIncludeDigerKanallarChange,
  favoriler = [],
  favorilerLoading = false,
  onlyFavoriler = false,
  onOnlyFavorilerChange,
  onFavoriSelect,
  gizlenen = [],
  gizlenenLoading = false,
  gizlenenKodlari,
  onlyGizlenen = false,
  onOnlyGizlenenChange,
  onGizlenenSelect,
  overlayAction,
  overlayLeading,
}: FilterPanelProps) {
  const isSheet = variant === "sheet";
  const isOverlay = variant === "overlay";
  const selectedCitySet = useMemo(
    () => new Set(selectedCities),
    [selectedCities]
  );
  const { results, loading: musteriSearchLoading } = useMusteriSearch(search);
  const [listOpen, setListOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayBodyRef = useRef<HTMLDivElement | null>(null);
  const [overlayBodyH, setOverlayBodyH] = useState<number | null>(null);

  const showList = listOpen && search.trim().length >= 2;

  const searchResults = useMemo((): SearchListItem[] => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    const items: SearchListItem[] = [];
    const seenMusteri = new Set<string>();

    if (q.length >= 2) {
      for (const entry of gizlenen) {
        if (entry.kind !== "musteri") continue;
        const item = entry.item;
        if (seenMusteri.has(item.musteri_kodu)) continue;
        const hay = [
          item.unvan,
          item.musteri_kodu,
          item.adres ?? "",
          item.sehir ?? "",
          item.ilce ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        if (!hay.includes(q)) continue;
        items.push({
          kind: "musteri",
          hit: {
            musteri_kodu: item.musteri_kodu,
            unvan: item.unvan,
            adres: item.adres,
            sehir: item.sehir,
            ilce: item.ilce,
            lat: item.lat,
            lon: item.lon,
            risk_durumu: item.risk_durumu ?? "hic_teslimat_yok",
          },
        });
        seenMusteri.add(item.musteri_kodu);
      }
    }

    for (const hit of results) {
      if (seenMusteri.has(hit.musteri_kodu)) continue;
      items.push({ kind: "musteri", hit });
      seenMusteri.add(hit.musteri_kodu);
    }

    if (showPotansiyel && q.length >= 2) {
      const seenPotansiyel = new Set<string>();
      let added = 0;

      // Gizlenen potansiyeller haritada yoksa bile aramada çıksın.
      for (const entry of gizlenen) {
        if (entry.kind !== "potansiyel") continue;
        const item = entry.item;
        const asHit: PotansiyelHarita = {
          id: item.id,
          kaynak_id: item.kaynak_id,
          isim: item.isim,
          adres: item.adres,
          ilce: item.ilce,
          il: item.il,
          lat: item.lat,
          lon: item.lon,
          primary_type: item.primary_type,
          google_types: item.google_types,
          kalite_bayragi: item.kalite_bayragi,
          tarandigi_tarih: item.tarandigi_tarih,
        };
        if (!matchPotansiyel(asHit, q)) continue;
        seenPotansiyel.add(item.id);
        items.push({ kind: "potansiyel", hit: asHit });
        added += 1;
        if (added >= POTANSIYEL_SEARCH_LIMIT) break;
      }

      if (added < POTANSIYEL_SEARCH_LIMIT) {
        for (const p of potansiyelRows) {
          if (seenPotansiyel.has(p.id)) continue;
          if (!matchPotansiyel(p, q)) continue;
          items.push({ kind: "potansiyel", hit: p });
          seenPotansiyel.add(p.id);
          added += 1;
          if (added >= POTANSIYEL_SEARCH_LIMIT) break;
        }
      }
    }

    return items;
  }, [results, gizlenen, search, showPotansiyel, potansiyelRows]);

  const loading =
    musteriSearchLoading ||
    (showPotansiyel && potansiyelLoading && searchResults.length === 0);

  useEffect(() => {
    if (search.trim().length < 2) setListOpen(false);
    else if (!isOverlay) setListOpen(true);
  }, [search, isOverlay]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const node = isOverlay ? overlayRef.current : searchWrapRef.current;
      if (!node?.contains(e.target as Node)) {
        setListOpen(false);
        if (isOverlay) setPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setListOpen(false);
      if (isOverlay) setPanelOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOverlay]);

  useLayoutEffect(() => {
    if (!isOverlay || !panelOpen) {
      setOverlayBodyH(null);
      return;
    }
    if (overlayBodyH != null) return;
    const el = overlayBodyRef.current;
    if (el) setOverlayBodyH(el.offsetHeight);
  }, [isOverlay, panelOpen, overlayBodyH]);

  const handleSelectMusteri = (hit: MusteriSearchHit) => {
    onSearchSelect(hit);
    onSearchChange(hit.unvan);
    setListOpen(false);
    if (isOverlay) setPanelOpen(false);
  };

  const handleSelectPotansiyel = (hit: PotansiyelHarita) => {
    onPotansiyelSearchSelect?.(hit);
    onSearchChange(hit.isim ?? "Potansiyel");
    setListOpen(false);
    if (isOverlay) setPanelOpen(false);
  };

  const searchPlaceholder = showPotansiyel
    ? "Müşteri veya potansiyel ara…"
    : "Dükkan, adres veya kod ara…";
  const searchAriaLabel = showPotansiyel
    ? "Müşteri veya potansiyel ara"
    : "Müşteri ara";

  const statsRow = (
    <div className="grid grid-cols-3 gap-2">
      <StatTile
        label="Haritalı"
        value={stats.toplam}
        ratio={1}
        color="var(--muted-foreground)"
      />
      <StatTile
        label="Görünen"
        value={stats.gorunen}
        ratio={stats.toplam > 0 ? stats.gorunen / stats.toplam : 0}
        color="var(--foreground)"
      />
      <StatTile
        label="Riskli"
        value={stats.riskli}
        ratio={stats.gorunen > 0 ? stats.riskli / stats.gorunen : 0}
        color={RISK_COLORS.riskli}
      />
    </div>
  );

  const filterFields = (
    <>
      <div>
        <SectionLabel>Risk durumu</SectionLabel>
        <RiskSegmentedControl
          value={selectedRisk}
          onChange={onSelectRisk}
          shortLabels={riskShortLabels}
        />
        <RiskDagilim
          dagilim={stats.dagilim}
          gorunen={stats.gorunen}
          riskLabels={riskLabels}
        />
      </div>

      <div>
        <SectionLabel>Kanal</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {onIncludeDigerKanallarChange ? (
            <Button
              size="sm"
              variant={includeDigerKanallar ? "default" : "outline"}
              onClick={() =>
                onIncludeDigerKanallarChange(!includeDigerKanallar)
              }
              className="h-7 rounded-full px-2.5 text-[11px]"
            >
              Diğer kanallar
            </Button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          {!includeDigerKanallar
            ? "Yem toptan, geleneksel vb. gizli — açmak için Diğer kanallar. Petshop / veteriner katman menüsünden."
            : "Petshop / veteriner katman menüsünden filtrelenir."}
        </p>
      </div>

      <div>
        <SectionLabel>Şehir</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {cities.map((city) => (
            <Button
              key={city}
              size="sm"
              variant={selectedCitySet.has(city) ? "default" : "outline"}
              onClick={() => onToggleCity(city)}
              className="h-7 rounded-full px-2.5 text-[11px]"
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
          className="h-7 gap-1.5 self-start rounded-full px-2 text-[11px]"
        >
          <XIcon className="size-3" />
          Filtreleri temizle
        </Button>
      )}

      {onFavoriSelect ? (
        <PotansiyelFavoriList
          items={favoriler}
          loading={favorilerLoading}
          onlyFavoriler={onlyFavoriler}
          onOnlyFavorilerChange={onOnlyFavorilerChange}
          onSelect={onFavoriSelect}
        />
      ) : null}

      {onGizlenenSelect ? (
        <GizlenenList
          items={gizlenen}
          loading={gizlenenLoading}
          onlyGizlenen={onlyGizlenen}
          onOnlyGizlenenChange={onOnlyGizlenenChange}
          onSelect={onGizlenenSelect}
        />
      ) : null}
    </>
  );

  const searchResultItems =
    loading && searchResults.length === 0 ? (
      <li className="px-3 py-2 text-[11px] text-muted-foreground">
        Aranıyor…
      </li>
    ) : searchResults.length === 0 ? (
      <li className="px-3 py-2 text-[11px] text-muted-foreground">
        Sonuç yok
      </li>
    ) : (
      searchResults.map((item) => {
        if (item.kind === "potansiyel") {
          const hit = item.hit;
          const title = hit.isim?.trim() || "İsimsiz potansiyel";
          const place = [hit.ilce, hit.il].filter(Boolean).join(", ");
          const adres =
            hit.adres && hit.adres.length > 48
              ? `${hit.adres.slice(0, 48)}…`
              : hit.adres;
          const gizlenenHit = potansiyelGizlenenIds?.has(hit.id) ?? false;
          return (
            <li key={`p:${hit.id}`} role="option">
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectPotansiyel(hit)}
              >
                <span className="flex items-center gap-1.5">
                  <span className="line-clamp-1 min-w-0 flex-1 text-[12px] font-medium leading-snug">
                    {title}
                  </span>
                  {gizlenenHit ? (
                    <EyeOffIcon
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-label="Gizlenen"
                    />
                  ) : null}
                </span>
                <span className="line-clamp-1 font-mono text-[10px] text-muted-foreground">
                  Potansiyel
                  {place ? ` · ${place}` : ""}
                  {gizlenenHit ? " · gizli" : ""}
                </span>
                {adres ? (
                  <span className="line-clamp-1 text-[10px] text-muted-foreground/80">
                    {adres}
                  </span>
                ) : null}
              </button>
            </li>
          );
        }

        const hit = item.hit;
        const place = [hit.ilce, hit.sehir].filter(Boolean).join(", ");
        const adres =
          hit.adres && hit.adres.length > 48
            ? `${hit.adres.slice(0, 48)}…`
            : hit.adres;
        const gizlenenHit = gizlenenKodlari?.has(hit.musteri_kodu) ?? false;
        return (
          <li key={`m:${hit.musteri_kodu}`} role="option">
            <button
              type="button"
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelectMusteri(hit)}
            >
              <span className="flex items-center gap-1.5">
                <span className="line-clamp-1 min-w-0 flex-1 text-[12px] font-medium leading-snug">
                  {hit.unvan}
                </span>
                {gizlenenHit ? (
                  <EyeOffIcon
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-label="Gizlenen"
                  />
                ) : null}
              </span>
              <span className="line-clamp-1 font-mono text-[10px] text-muted-foreground">
                {hit.musteri_kodu}
                {place ? ` · ${place}` : ""}
                {gizlenenHit ? " · gizli" : ""}
              </span>
              {adres ? (
                <span className="line-clamp-1 text-[10px] text-muted-foreground/80">
                  {adres}
                </span>
              ) : null}
            </button>
          </li>
        );
      })
    );

  if (isOverlay) {
    return (
      <div
        ref={overlayRef}
        className="flex w-full flex-col"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex h-12 items-center rounded-full border border-border/50 bg-popover/80 py-1.5 pr-1.5 text-popover-foreground shadow-[0_8px_28px_-14px_rgba(0,0,0,0.5)] backdrop-blur-[18px] backdrop-saturate-150",
            overlayLeading ? "pl-1.5 lg:pl-4" : "pl-4"
          )}
          onPointerDown={() => setPanelOpen(true)}
        >
          {overlayLeading ? (
            <div
              className="shrink-0 lg:hidden"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {overlayLeading}
            </div>
          ) : null}
          <ClearDissolveInput
            value={search}
            onChange={(v) => {
              onSearchChange(v);
              setPanelOpen(true);
              setListOpen(v.trim().length >= 2);
            }}
            onFocus={() => {
              setPanelOpen(true);
              if (search.trim().length >= 2) setListOpen(true);
            }}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-sm"
            contentClassName="pr-8 pl-0 text-[13px]"
            clearButtonClassName="right-1"
            aria-label={searchAriaLabel}
            aria-autocomplete="list"
            aria-expanded={panelOpen}
            role="combobox"
          />
          <SearchIcon
            className="mx-1 size-[18px] shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          {overlayAction ? (
            <button
              type="button"
              aria-label={overlayAction.label ?? "Veri yükle"}
              aria-pressed={overlayAction.pressed}
              title={overlayAction.label ?? "Veri yükle"}
              onClick={() => {
                setPanelOpen(false);
                setListOpen(false);
                overlayAction.onClick();
              }}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground outline-none transition-colors",
                "hover:bg-muted/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                overlayAction.pressed && "bg-muted/50 text-foreground"
              )}
            >
              <DataUploadGlyph />
            </button>
          ) : null}
        </div>
        {panelOpen ? (
          <div className="mt-2 rounded-2xl border border-border/45 bg-popover/66 text-popover-foreground shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] backdrop-blur-[24px] backdrop-saturate-150">
            <div
              ref={overlayBodyRef}
              className="flex max-h-[min(36rem,calc(100dvh-11rem))] min-h-0 flex-col overflow-hidden rounded-2xl"
              style={overlayBodyH != null ? { height: overlayBodyH } : undefined}
            >
              {showList && overlayBodyH != null ? (
                <ul
                  role="listbox"
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
                >
                  {searchResultItems}
                </ul>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
                  {statsRow}
                  {filterFields}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-3",
          isSheet ? "flex-1 pt-12 pr-12" : "flex-1 pt-5"
        )}
      >
        <div className="min-w-0">
          <Typography.Heading level={5} className="tracking-tight">
            Petshop Müşteri Haritası
          </Typography.Heading>
          <Typography.Paragraph size="xs" color="muted" className="mt-1">
            Ege bölgesi müşteri dağılımı ve teslimat risk durumu
          </Typography.Paragraph>
        </div>

        {statsRow}

        <div ref={searchWrapRef} className="relative z-10">
          <ClearDissolveInput
            value={search}
            onChange={onSearchChange}
            onFocus={() => {
              if (search.trim().length >= 2) setListOpen(true);
            }}
            placeholder={searchPlaceholder}
            className="h-9 rounded-full border border-input bg-muted/35 text-xs"
            contentClassName="px-9 text-xs"
            startAdornment={
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 z-[4] size-3.5 -translate-y-1/2 text-muted-foreground" />
            }
            aria-label={searchAriaLabel}
            aria-autocomplete="list"
            aria-expanded={showList}
            role="combobox"
          />
          {showList ? (
            <ul
              role="listbox"
              className="absolute top-[calc(100%+0.35rem)] right-0 left-0 max-h-56 overflow-y-auto rounded-xl border border-border/80 bg-popover py-1 shadow-lg"
            >
              {searchResultItems}
            </ul>
          ) : null}
        </div>

        {filterFields}
      </div>
    </div>
  );
});

function RiskSegmentedControl({
  value,
  onChange,
  shortLabels = DEFAULT_RISK_SHORT_LABELS,
}: {
  value: RiskDurumu | null;
  onChange: (risk: RiskDurumu | null) => void;
  shortLabels?: Record<RiskDurumu, string>;
}) {
  const instanceId = useId();
  const options: { key: string; risk: RiskDurumu | null; label: string }[] = [
    { key: "all", risk: null, label: "Tümü" },
    ...RISK_ORDER.map((risk) => ({
      key: risk,
      risk: risk as RiskDurumu | null,
      label: shortLabels[risk],
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Risk durumu filtresi"
      className="flex w-full items-stretch rounded-full border bg-muted/35 p-0.5"
    >
      {options.map((option) => {
        const active = value === option.risk;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.risk)}
            className={cn(
              "relative min-h-10 min-w-0 flex-auto rounded-full px-1 py-2 text-[10px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-0 sm:px-1 sm:py-1.5 sm:text-[10px]",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={`risk-segment-${instanceId}`}
                className="absolute inset-0 rounded-full bg-secondary shadow-sm ring-1 ring-border"
                transition={{
                  type: "tween",
                  duration: 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RiskDagilim({
  dagilim,
  gorunen,
  riskLabels = DEFAULT_RISK_LABELS,
}: {
  dagilim: Record<RiskDurumu, number>;
  gorunen: number;
  riskLabels?: Record<RiskDurumu, string>;
}) {
  const TOTAL_BLOCKS = 24;
  const blocks: { risk: RiskDurumu; count: number }[] = [];
  if (gorunen > 0) {
    let used = 0;
    for (const risk of RISK_ORDER) {
      const exact = (dagilim[risk] / gorunen) * TOTAL_BLOCKS;
      const count = dagilim[risk] > 0 ? Math.max(1, Math.round(exact)) : 0;
      blocks.push({ risk, count });
      used += count;
    }
    let overflow = used - TOTAL_BLOCKS;
    while (overflow !== 0 && blocks.some((b) => b.count > 1)) {
      const biggest = blocks.reduce((a, b) => (b.count > a.count ? b : a));
      biggest.count -= Math.sign(overflow);
      overflow -= Math.sign(overflow);
    }
  }

  const colors: string[] = Array(TOTAL_BLOCKS).fill("var(--secondary)");
  let cursor = 0;
  for (const { risk, count } of blocks) {
    for (let i = 0; i < count && cursor < TOTAL_BLOCKS; i++) {
      colors[cursor++] = RISK_COLORS[risk];
    }
  }

  return (
    <div className="mt-2.5">
      <div className="flex gap-[2px]" role="img" aria-label="Risk dağılımı">
        {colors.map((color, i) => (
          <span
            key={i}
            className="h-1.5 min-w-0 flex-1 rounded-[1px] transition-colors duration-300 ease-out"
            style={{
              backgroundColor: color,
              transitionDelay: `${Math.min(i, 12) * 8}ms`,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {RISK_ORDER.map((risk) => (
          <span
            key={risk}
            title={`${riskLabels[risk]}: ${dagilim[risk]}`}
            className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: RISK_COLORS[risk] }}
            />
            {dagilim[risk]}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function StatTile({
  label,
  value,
  ratio,
  color,
}: {
  label: string;
  value: number;
  ratio: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-2.5 py-2">
      <p className="text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-[15px] leading-none font-semibold tabular-nums">
        {value}
      </p>
      <SegmentBar className="mt-2" segments={8} value={ratio} color={color} />
    </div>
  );
}

/** GMaps yol tarifi glifi gibi: kalın, sade, kare zemin üzerinde okunur. */
function DataUploadGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 12.75V4.6"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M6.6 7.35 10 4.2l3.4 3.15"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.35 12.1v2.4c0 .75.6 1.35 1.35 1.35h8.6c.75 0 1.35-.6 1.35-1.35v-2.4"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}
