import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Önceki döneme göre değişim rozeti.
 *
 * Ay dönümü sorununun ekrandaki karşılığı: seçili dönem daralınca önceki
 * dönemin rakamı tamamen kaybolmuyor, kıyas olarak duruyor.
 *
 * `oran` null = önceki dönem sıfır; oran tanımsız olduğu için "%∞" yerine
 * "—" gösterilir (bkz. degisimOrani, lib/donem.ts).
 */
export function DegisimRozeti({ oran }: { oran: number | null }) {
  if (oran == null) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[12px] text-muted-foreground"
        title="Önceki dönemde hareket yok — oran hesaplanamıyor"
      >
        <MinusIcon className="size-3" strokeWidth={2} aria-hidden />—
      </span>
    );
  }

  const artis = oran >= 0;
  const Ikon = artis ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums",
        artis ? "text-emerald-400" : "text-destructive"
      )}
      title="Bir önceki eşit uzunluktaki döneme göre"
    >
      <Ikon className="size-3" strokeWidth={2} aria-hidden />
      {artis ? "+" : "−"}
      {Math.abs(oran * 100).toFixed(0)}%
    </span>
  );
}
