import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatCurrencyPrecise } from "@/lib/format";
import {
  RISK_ICONS,
  avatarBackgroundFor,
  durumPalette,
  initialsFor,
  segmentDisplayLabel,
  segmentPalette,
} from "@/lib/raporlama-style";
import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import type { RiskDurumu } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Haritada kullanılan risk renk/etiket token'larıyla birebir aynı (RISK_COLORS/RISK_SHORT_LABELS). */
export function RiskPill({ risk }: { risk: RiskDurumu }) {
  const color = RISK_COLORS[risk];
  const Icon = RISK_ICONS[risk];
  return (
    <Badge
      variant="outline"
      className="gap-1 font-medium"
      style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}4d` }}
    >
      <Icon className="size-3" />
      {RISK_SHORT_LABELS[risk]}
    </Badge>
  );
}

export function SegmentTag({ musteriGrubu }: { musteriGrubu: string | null }) {
  const palette = segmentPalette(musteriGrubu);
  return (
    <Badge
      variant="outline"
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
  if (!durum) return <span className="text-xs text-muted-foreground/50">—</span>;
  const palette = durumPalette(durum);
  return (
    <Badge
      variant="outline"
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
    return <span className="text-xs text-muted-foreground/50">Atanmamış</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white/90"
        style={{ backgroundColor: avatarBackgroundFor(ad) }}
        aria-hidden
      >
        {initialsFor(ad)}
      </div>
      <span className="truncate text-[13px]">{ad}</span>
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
        "font-mono text-[13px] font-semibold tabular-nums",
        danger ? "text-red-400" : "text-foreground"
      )}
    >
      {text}
    </span>
  );
}
