"use client";

import { AlertTriangleIcon, CheckCircle2Icon, MapPinOffIcon, PackageIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import type { RotaDuragi } from "@/hooks/useRotaPlani";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { formatKg, formatNumber } from "@/lib/format";
import { RISK_COLORS, RISK_SHORT_LABELS } from "@/lib/risk-style";
import { cn } from "@/lib/utils";

interface DurakHavuzuProps {
  duraklar: RotaDuragi[];
  /** Seçili araç yoksa tıklama pasif — kullanıcı önce araç seçmeli. */
  seciliAracAdi: string | null;
  onDurakEkle: (musteriKodu: string) => void;
  loading: boolean;
}

/**
 * Henüz araca atanmamış bekleyen sipariş yükü. Sağdaki araç kartlarından biri
 * seçiliyken bir durağa tıklamak onu o araca yükler.
 */
export function DurakHavuzu({
  duraklar,
  seciliAracAdi,
  onDurakEkle,
  loading,
}: DurakHavuzuProps) {
  const bos = duraklar.length === 0;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    duraklar.length
  );

  const toplamKg = duraklar.reduce((t, d) => t + d.kg, 0);

  return (
    <section
      ref={wrapperRef}
      className="relative flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0"
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <PackageIcon
            className={cn("size-3.5 shrink-0", !bos && "text-amber-400")}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">Bekleyen yük</span>
        </h2>
        {!bos ? (
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-foreground tabular-nums">
            {formatKg(Math.round(toplamKg))}
          </span>
        ) : null}
      </header>

      <p className="flex h-9 shrink-0 items-center border-b border-border/60 px-3.5 text-[12px] text-muted-foreground">
        <span className="truncate">
          {seciliAracAdi
            ? `Tıklanan durak → ${seciliAracAdi}`
            : "Yüklemek için önce sağdan bir araç seçin"}
        </span>
      </p>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {bos ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <CheckCircle2Icon
              className="size-6 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[13px] text-muted-foreground">
              Havuz boş — bekleyen yükün tamamı araçlara dağıtıldı.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {duraklar.map((d) => (
              <DurakSatiri
                key={d.musteriKodu}
                durak={d}
                pasif={seciliAracAdi == null}
                onSec={() => onDurakEkle(d.musteriKodu)}
              />
            ))}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}

function DurakSatiri({
  durak,
  pasif,
  onSec,
}: {
  durak: RotaDuragi;
  pasif: boolean;
  onSec: () => void;
}) {
  const konumsuz = durak.lat == null || durak.lon == null;

  return (
    <li>
      <button
        type="button"
        onClick={onSec}
        disabled={pasif || konumsuz}
        className={cn(
          "flex w-full min-w-0 flex-col gap-1 px-3.5 py-2 text-left transition-colors",
          !pasif && !konumsuz && "hover:bg-accent/50",
          (pasif || konumsuz) && "cursor-default"
        )}
        title={
          konumsuz
            ? "Koordinatı yok — haritaya konamaz, plana giremez"
            : pasif
              ? "Önce bir araç seçin"
              : `${durak.unvan} durağını seçili araca ekle`
        }
      >
        <div className="flex min-w-0 items-baseline gap-2">
          {durak.riskDurumu ? (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: RISK_COLORS[durak.riskDurumu] }}
              title={RISK_SHORT_LABELS[durak.riskDurumu]}
              aria-label={RISK_SHORT_LABELS[durak.riskDurumu]}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
            {durak.unvan}
          </span>
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-foreground tabular-nums">
            {formatKg(Math.round(durak.kg))}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="min-w-0 truncate">{durak.ilce ?? durak.sehir ?? "—"}</span>
          <span className="shrink-0 tabular-nums">
            {formatNumber(Math.round(durak.cuvalEsdeger))} çuval
          </span>
          {konumsuz ? (
            <span className="flex shrink-0 items-center gap-1 text-destructive">
              <MapPinOffIcon className="size-3" strokeWidth={2} aria-hidden />
              konum yok
            </span>
          ) : null}
          {durak.olcusuzSatir > 0 ? (
            <span
              className="flex shrink-0 items-center gap-1 text-amber-400"
              title={`${durak.olcusuzSatir} satırın ölçüsü bilinmiyor — yük olduğundan az görünüyor.`}
            >
              <AlertTriangleIcon className="size-3" strokeWidth={2} aria-hidden />
              ölçüsüz
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
