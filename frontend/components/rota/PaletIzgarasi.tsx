"use client";

import { LayersIcon } from "lucide-react";

import type { RotaAraci, RotaDuragi } from "@/hooks/useRotaPlani";
import { PALET_CUVAL, paletlereYerlestir, type PaletSlotu } from "@/lib/rota/palet";
import { formatKg, formatNumber } from "@/lib/format";
import { useSurukleme } from "./surukleme";
import { cn } from "@/lib/utils";

interface PaletIzgarasiProps {
  arac: RotaAraci;
  duraklar: RotaDuragi[];
  /** Bir slota tıklanınca ilk müşterisi seçilir (durak listesinde vurgulamak için). */
  onDurakSec?: (musteriKodu: string) => void;
  vurgulananMusteri?: string | null;
  /**
   * Verilirse slot içeriği havuza geri alınabilir: tıklayınca çıkar,
   * sürükleyince başka araca ya da havuza taşınır.
   */
  onDurakCikar?: (musteriKodu: string) => void;
  /** Sürüklenen durağın kaynağı — hangi araçtan çıktığı. */
  aracKod?: string | null;
}

/**
 * Araç kasasının palet gözleri.
 *
 * Doluluk yüzdesi "araç ne kadar dolu" der; bu ızgara yükleyicinin sorusunu
 * cevaplar: HANGİ PALETTE KİMİN MALI VAR. Karışık palet (birden fazla müşteri)
 * elle indiriliyor — Melih'in tarif ettiği yavaş durak bu.
 */
export function PaletIzgarasi({
  arac,
  duraklar,
  onDurakSec,
  vurgulananMusteri,
  onDurakCikar,
  aracKod,
}: PaletIzgarasiProps) {
  const yerlesim = paletlereYerlestir(duraklar, arac);
  const { slotlar, satirSayisi, karisikSayisi, tasanCuval } = yerlesim;
  const sutunSayisi = Math.ceil(slotlar.length / satirSayisi);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <LayersIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          Palet yerleşimi
        </span>
        <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {formatNumber(slotlar.filter((s) => s.doluCuval > 0).length)} /{" "}
          {formatNumber(slotlar.length)} göz
        </span>
        {karisikSayisi > 0 ? (
          <span
            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
            title="Karışık palette birden fazla müşterinin malı var — elle indiriliyor"
          >
            {formatNumber(karisikSayisi)} karışık palet
          </span>
        ) : null}
        {tasanCuval > 0 ? (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
            {formatNumber(Math.round(tasanCuval))} çuval sığmıyor
          </span>
        ) : null}
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${sutunSayisi}, minmax(0, 1fr))` }}
      >
        {slotlar.map((slot) => (
          <Slot
            key={slot.etiket}
            slot={slot}
            duraklar={duraklar}
            onDurakSec={onDurakSec}
            vurgulananMusteri={vurgulananMusteri ?? null}
            onDurakCikar={onDurakCikar}
            aracKod={aracKod ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function Slot({
  slot,
  duraklar,
  onDurakSec,
  vurgulananMusteri,
  onDurakCikar,
  aracKod,
}: {
  slot: PaletSlotu;
  duraklar: RotaDuragi[];
  onDurakSec?: (musteriKodu: string) => void;
  vurgulananMusteri: string | null;
  onDurakCikar?: (musteriKodu: string) => void;
  aracKod: string | null;
}) {
  const { basla, suruklendiMi, durum } = useSurukleme();

  const bos = slot.doluCuval <= 0;
  const yuzde = Math.min(100, (slot.doluCuval / PALET_CUVAL) * 100);
  const ilkMusteri = slot.duraklar[0]?.musteriKodu ?? null;
  const vurgulu =
    vurgulananMusteri != null &&
    slot.duraklar.some((d) => d.musteriKodu === vurgulananMusteri);

  /** Slottaki farklı müşteriler — çıkarma hepsini havuza döndürür. */
  const musteriKodlari = [...new Set(slot.duraklar.map((d) => d.musteriKodu))];
  const cikarilabilir = !bos && onDurakCikar != null;
  const tiklanabilir =
    !bos && (cikarilabilir || (onDurakSec != null && ilkMusteri != null));
  const suruluyor =
    durum != null &&
    slot.duraklar.some((d) => d.musteriKodu === durum.musteriKodu);

  const baslik = bos
    ? slot.agirlikKilitli
      ? `${slot.etiket} — kasada yer var ama ağırlık sınırı bu gözden önce doluyor`
      : `${slot.etiket} — boş`
    : slot.duraklar
        .map(
          (d) =>
            `${d.sira}. ${d.unvan}: ${formatNumber(Math.round(d.cuval))} çuval / ${formatKg(d.kg)}`
        )
        .join("\n") +
      (cikarilabilir
        ? "\n\nTıkla → havuza geri al · sürükle → başka araca taşı"
        : "");

  const tikla = () => {
    // Sürükleme sonrası gelen click çıkarmayı tetiklemesin.
    if (suruklendiMi()) return;
    if (cikarilabilir) {
      for (const kod of musteriKodlari) onDurakCikar(kod);
      return;
    }
    if (ilkMusteri != null) onDurakSec?.(ilkMusteri);
  };

  const tut = (event: React.PointerEvent) => {
    if (aracKod == null || ilkMusteri == null) return;
    const tam = duraklar.find((d) => d.musteriKodu === ilkMusteri);
    if (tam) basla(event, { durak: tam, kaynakAracKod: aracKod });
  };

  const Kap = tiklanabilir ? "button" : "div";

  return (
    <Kap
      {...(tiklanabilir
        ? {
            type: "button" as const,
            onClick: tikla,
            onPointerDown: cikarilabilir ? tut : undefined,
          }
        : {})}
      title={baslik}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 overflow-hidden rounded border p-2 text-left transition-colors",
        bos
          ? slot.agirlikKilitli
            ? "border-dashed border-border/50 bg-muted/20"
            : "border-dashed border-border/70"
          : slot.karisik
            ? "border-amber-500/50 bg-amber-500/5"
            : "border-border bg-accent/30",
        vurgulu && "ring-2 ring-foreground/40",
        suruluyor && "opacity-40",
        tiklanabilir && "hover:border-foreground/40",
        cikarilabilir && "cursor-grab active:cursor-grabbing"
      )}
    >
      {/* Doluluk zemini — slotun ne kadarı dolu, arka planda */}
      {!bos ? (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 -z-10",
            slot.karisik ? "bg-amber-500/15" : "bg-foreground/10"
          )}
          style={{ height: `${yuzde}%` }}
          aria-hidden
        />
      ) : null}

      <span className="flex items-baseline justify-between gap-1">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">
          {slot.etiket}
        </span>
        {slot.karisik ? (
          <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        ) : null}
      </span>

      {bos ? (
        <span className="text-[11px] text-muted-foreground">
          {slot.agirlikKilitli ? "ağırlık sınırı" : "boş"}
        </span>
      ) : (
        <>
          <span className="truncate text-[11.5px] font-medium text-foreground">
            {slot.duraklar[0]!.unvan}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {formatNumber(Math.round(slot.doluCuval))} çuval
            {slot.duraklar.length > 1
              ? ` · +${formatNumber(slot.duraklar.length - 1)}`
              : ""}
          </span>
        </>
      )}
    </Kap>
  );
}
