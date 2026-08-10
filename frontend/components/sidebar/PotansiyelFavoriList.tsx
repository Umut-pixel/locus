"use client";

import { HeartIcon } from "lucide-react";
import { Typography } from "@heroui/react";

import { FAVORI_HEART_COLOR } from "@/components/map/FavoriHeartButton";
import type { MusteriFavori, PotansiyelFavori } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SonraBakItem =
  | { kind: "musteri"; item: MusteriFavori }
  | { kind: "potansiyel"; item: PotansiyelFavori };

interface SonraBakListProps {
  items: SonraBakItem[];
  loading?: boolean;
  onlyFavoriler?: boolean;
  onOnlyFavorilerChange?: (value: boolean) => void;
  onSelect: (entry: SonraBakItem) => void;
  className?: string;
}
/** Sidebar / sheet — ortak "sonra bak" listesi (müşteri + potansiyel). */
export function SonraBakList({
  items,
  loading = false,
  onlyFavoriler = false,
  onOnlyFavorilerChange,
  onSelect,
  className,
}: SonraBakListProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Sonra bak
          {items.length > 0 ? (
            <span className="ml-1.5 tabular-nums opacity-80">{items.length}</span>
          ) : null}
        </p>
        {onOnlyFavorilerChange && items.length > 0 ? (
          <button
            type="button"
            aria-pressed={onlyFavoriler}
            onClick={() => onOnlyFavorilerChange(!onlyFavoriler)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
              onlyFavoriler
                ? "bg-[#ff385c]/15 text-[#ff385c]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Haritada filtrele
          </button>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <Typography.Paragraph size="xs" color="muted">
          Müşteri veya potansiyel kartındaki kalple buraya ekleyin.
        </Typography.Paragraph>
      ) : (
        <ul className="max-h-44 space-y-0.5 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-muted/20 py-1">
          {items.map((entry) => {
            if (entry.kind === "musteri") {
              const item = entry.item;
              const place = [item.ilce, item.sehir].filter(Boolean).join(", ");
              return (
                <li key={`m-${item.favori_id}`}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50"
                    onClick={() => onSelect(entry)}
                  >
                    <HeartIcon
                      className="mt-0.5 size-3 shrink-0"
                      style={{
                        color: FAVORI_HEART_COLOR,
                        fill: FAVORI_HEART_COLOR,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-[12px] font-medium leading-snug">
                        {item.unvan}
                      </span>
                      <span className="line-clamp-1 font-mono text-[10px] text-muted-foreground">
                        {item.musteri_kodu}
                        {place ? ` · ${place}` : ""}
                        {item.not_metni ? ` · ${item.not_metni}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            }

            const item = entry.item;
            const place = [item.ilce, item.il].filter(Boolean).join(", ");
            return (
              <li key={`p-${item.favori_id}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50"
                  onClick={() => onSelect(entry)}
                >
                  <HeartIcon
                    className="mt-0.5 size-3 shrink-0"
                    style={{
                      color: FAVORI_HEART_COLOR,
                      fill: FAVORI_HEART_COLOR,
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[12px] font-medium leading-snug">
                      {item.isim ?? "İsimsiz"}
                    </span>
                    <span className="line-clamp-1 font-mono text-[10px] text-muted-foreground">
                      Potansiyel
                      {place ? ` · ${place}` : ""}
                      {item.not_metni ? ` · ${item.not_metni}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** @deprecated — eski ad; SonraBakList kullan. */
export const PotansiyelFavoriList = SonraBakList;
