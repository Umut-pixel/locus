import Avatar from "boring-avatars";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatCurrencyPrecise } from "@/lib/format";
import {
  AVATAR_COLORS,
  RISK_ICONS,
  durumPalette,
  segmentDisplayLabel,
  segmentPalette,
} from "@/lib/raporlama-style";
import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import type { RiskDurumu } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Yoğun (dense) CRM tablosu için ortak rozet ölçüsü — 2026-08-10'da ilk
 * geçişten (20px/10.5px) sonra "çok dar" geri bildirimiyle ~%20 büyütüldü:
 * 24px yükseklik, 12px metin, 6px köşe.
 */
const DENSE_BADGE =
  "h-6 rounded-[6px] border px-2 py-0 text-[12px] leading-none font-medium";

/** Haritada kullanılan risk renk/etiket token'larıyla birebir aynı (RISK_COLORS/RISK_SHORT_LABELS). */
export function RiskPill({ risk }: { risk: RiskDurumu }) {
  const color = RISK_COLORS[risk];
  const Icon = RISK_ICONS[risk];
  return (
    <Badge
      variant="outline"
      className={cn(DENSE_BADGE, "gap-1.5 [&>svg]:size-3!")}
      style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}4d` }}
    >
      <Icon />
      {RISK_SHORT_LABELS[risk]}
    </Badge>
  );
}

export function SegmentTag({ musteriGrubu }: { musteriGrubu: string | null }) {
  const palette = segmentPalette(musteriGrubu);
  return (
    <Badge
      variant="outline"
      className={DENSE_BADGE}
      style={{
        backgroundColor: palette.bg,
        color: palette.text,
        borderColor: palette.border,
      }}
    >
      {segmentDisplayLabel(musteriGrubu)}
    </Badge>
  );
}

/** musteri_ek_grup canlı şemada yok — durum (Aktif/Pasif/İptal) en yakın gerçek ikinci etiket. */
export function DurumTag({ durum }: { durum: string | null }) {
  if (!durum)
    return <span className="text-[13px] text-muted-foreground">—</span>;
  const palette = durumPalette(durum);
  return (
    <Badge
      variant="outline"
      className={DENSE_BADGE}
      style={{
        backgroundColor: palette.bg,
        color: palette.text,
        borderColor: palette.border,
      }}
    >
      {durum}
    </Badge>
  );
}

/** belge_st_adi (5450/BelgeDetayRaporu) — view'da ayrı bir "temsilci" alanı yok, en yakın gerçek isim kolonu. */
export function TemsilciAvatar({ ad }: { ad: string | null }) {
  if (!ad) {
    return <span className="text-[13px] text-muted-foreground">Atanmamış</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar
        name={ad}
        variant="beam"
        colors={AVATAR_COLORS}
        size={24}
        square={false}
      />
      <span className="truncate text-[13.5px]">{ad}</span>
    </div>
  );
}

/** ₺ formatter'ın kendisi zaten para birimi ikonlu (Intl currency, tr-TR). */
export function CurrencyAmount({
  value,
  precise = false,
  danger = false,
}: {
  value: number | null;
  precise?: boolean;
  danger?: boolean;
}) {
  const amount = value ?? 0;
  const text = precise ? formatCurrencyPrecise(amount) : formatCurrency(amount);
  return (
    <span
      className={cn(
        "font-mono text-[14px] font-medium tabular-nums",
        danger ? "text-red-400" : "text-foreground"
      )}
    >
      {text}
    </span>
  );
}
