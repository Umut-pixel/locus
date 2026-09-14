"use client";

import { Loader2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GUNLUK_TARAMA_LIMITI, type TaramaKotasi } from "@/lib/potansiyel-tarama";
import { cn } from "@/lib/utils";

/**
 * İl seçim modunun üst çubuğu — cam panel reçetesi (FilterPanel overlay /
 * CustomerDetailPanel ile aynı dil).
 */
export function IlSecimBari({
  yukleniyor,
  kota,
  onKapat,
  className,
}: {
  yukleniyor: boolean;
  kota: TaramaKotasi | null;
  onKapat: () => void;
  className?: string;
}) {
  const kalan = kota?.kalan ?? null;
  const limit = kota?.limit ?? GUNLUK_TARAMA_LIMITI;

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-full border border-border/45 bg-popover/66 py-1.5 pl-4 pr-1.5 text-popover-foreground",
        "shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] backdrop-blur-[24px] backdrop-saturate-150",
        className
      )}
    >
      {yukleniyor ? (
        <span className="flex items-center gap-2 text-sm">
          <Loader2Icon className="size-4 animate-spin" strokeWidth={1.75} />
          İl sınırları yükleniyor…
        </span>
      ) : (
        <span className="text-sm font-medium">Taranacak ili seçin</span>
      )}

      {kalan != null ? (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
            kalan <= 0 ? "bg-caution/15 text-caution" : "bg-secondary text-foreground/75"
          )}
        >
          bugün {kalan}/{limit}
        </span>
      ) : null}

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="İl seçimini kapat"
        onClick={onKapat}
        className="rounded-full"
      >
        <XIcon className="size-4" strokeWidth={1.75} />
      </Button>
    </div>
  );
}
