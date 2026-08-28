import { Avatar } from "@heroui/react";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatCurrencyPrecise } from "@/lib/format";
import {
  RISK_ICONS,
  durumPalette,
  segmentDisplayLabel,
  segmentPalette,
  temsilciInitials,
  temsilciRengi,
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

/**
 * Renk/ikon haritadakiyle birebir aynı (RISK_COLORS/RISK_ICONS — boyut-nötr).
 * `labels` varsayılan olarak sevkiyat sözlüğü; raporlama borç bazlı gösterim
 * için BORC_RISK_SHORT_LABELS geçirir (bkz. lib/risk-mode.ts).
 */
export function RiskPill({
  risk,
  labels = RISK_SHORT_LABELS,
}: {
  risk: RiskDurumu;
  labels?: Record<RiskDurumu, string>;
}) {
  const color = RISK_COLORS[risk];
  const Icon = RISK_ICONS[risk];
  return (
    <span
      className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-[6px] border px-2 text-[12px] leading-none font-medium"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color, borderColor: `color-mix(in oklab, ${color} 38%, transparent)` }}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{labels[risk]}</span>
    </span>
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
      <Avatar size="sm">
        <Avatar.Fallback
          className="font-semibold"
          style={{ backgroundColor: temsilciRengi(ad), color: "#14161a" }}
        >
          {temsilciInitials(ad)}
        </Avatar.Fallback>
      </Avatar>
      <span className="truncate text-[13.5px]">{ad}</span>
    </div>
  );
}

/**
 * ₺ formatter'ın kendisi zaten para birimi ikonlu (Intl currency, tr-TR).
 *
 * null = "bu müşteri için veri yok" (ör. hiç satış belgesi ya da yaşlandırma
 * kaydı yok) — gerçek sıfırdan ayrılsın diye "—" gösterilir. Eskiden `?? 0` ile
 * ₺0,00 basılıyordu ve 1.203 müşterinin ~750'sinde "cirosu yok" izlenimi
 * veriyordu (2026-08-11 audit'i).
 */
export function CurrencyAmount({
  value,
  precise = false,
  danger = false,
}: {
  value: number | null;
  precise?: boolean;
  danger?: boolean;
}) {
  if (value == null) {
    return (
      <span
        className="font-mono text-[14px] tabular-nums text-muted-foreground"
        title="Bu müşteri için veri yok"
      >
        —
      </span>
    );
  }
  const text = precise ? formatCurrencyPrecise(value) : formatCurrency(value);
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
