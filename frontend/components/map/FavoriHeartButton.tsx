"use client";

import { HeartIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Airbnb Rausch — wishlist kalp dolgu. */
export const FAVORI_HEART_COLOR = "#ff385c";

type Props = {
  active: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** Aktif / pasif aria-label. */
  labelActive?: string;
  labelInactive?: string;
  className?: string;
  /** Liste satırı gibi daha küçük ikon. */
  size?: "md" | "sm";
};

/**
 * Airbnb wishlist kalbi: boşken beyaz stroke + gölge, doluyken Rausch fill,
 * tıklamada hafif scale.
 */
export function FavoriHeartButton({
  active,
  busy = false,
  onToggle,
  labelActive = "Sonra bak listesinden çıkar",
  labelInactive = "Sonra bak",
  className,
  size = "md",
}: Props) {
  const touch = size === "md" ? "size-10 sm:size-8" : "size-7";
  const icon = size === "md" ? "size-[18px] sm:size-4" : "size-3.5";

  return (
    <button
      type="button"
      onClick={onToggle}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={busy}
      aria-pressed={active}
      aria-label={active ? labelActive : labelInactive}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full transition-[transform,opacity] duration-150",
        "hover:scale-105 active:scale-90",
        touch,
        busy && "pointer-events-none opacity-50",
        className
      )}
    >
      <HeartIcon
        strokeWidth={active ? 1.75 : 2.25}
        className={cn(
          icon,
          "transition-[transform,color,fill] duration-200 ease-out",
          active
            ? "scale-110 fill-[#ff385c] text-[#ff385c]"
            : "fill-[rgba(0,0,0,0.28)] text-white drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.45)]"
        )}
        style={active ? { color: FAVORI_HEART_COLOR, fill: FAVORI_HEART_COLOR } : undefined}
      />
    </button>
  );
}
