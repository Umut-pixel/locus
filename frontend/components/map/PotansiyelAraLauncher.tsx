"use client";

import { RadarIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Potansiyel ara" başlatıcısı — `MapLayersControl`'ün KARDEŞİ, içindeki bir
 * tile değil. Katmanlar paneli bir görünüm anahtarı yüzeyi; para harcayan ve
 * haritayı devralan bir eylemi oraya koymak kategori hatası olurdu.
 *
 * Glif reçetesi MapLayersControl.tsx:87-99 ile aynı.
 */
export function PotansiyelAraLauncher({
  aktif,
  kalanKota,
  taramaCalisiyor,
  onToggle,
  className,
}: {
  aktif: boolean;
  kalanKota: number | null;
  taramaCalisiyor: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const kotaDoldu = kalanKota != null && kalanKota <= 0;
  const devreDisi = taramaCalisiyor;

  const baslik = taramaCalisiyor
    ? "Bir tarama zaten çalışıyor"
    : kotaDoldu
      ? "Günlük tarama hakkı doldu — yarın yenilenir"
      : "Haritadan il seçip potansiyel müşteri ara";

  return (
    <div className={cn("pointer-events-auto relative z-20", className)}>
      <button
        type="button"
        aria-pressed={aktif}
        aria-label={baslik}
        title={baslik}
        disabled={devreDisi}
        onClick={onToggle}
        className="group flex flex-col items-center gap-1 outline-none disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span
          className={cn(
            "relative flex size-10 items-center justify-center rounded-[14px] border text-popover-foreground backdrop-blur-[18px] backdrop-saturate-150 transition-colors",
            "border-border/50 bg-popover/80 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.5)]",
            aktif ? "border-foreground/45" : "group-hover:group-enabled:border-foreground/30"
          )}
        >
          <RadarIcon
            className={cn("size-[18px]", taramaCalisiyor && "animate-pulse")}
            strokeWidth={1.75}
          />
          {kalanKota != null ? (
            <span
              className={cn(
                "absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-4 tabular-nums",
                kotaDoldu
                  ? "bg-caution/20 text-caution"
                  : "bg-secondary text-foreground/80"
              )}
            >
              {kalanKota}
            </span>
          ) : null}
        </span>
        <span className="text-[10px] font-medium tracking-tight text-foreground drop-shadow-sm">
          Potansiyel ara
        </span>
      </button>
    </div>
  );
}
