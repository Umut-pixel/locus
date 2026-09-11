"use client";

import { AlertTriangleIcon, MapPinOffIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { RotaOzeti } from "@/hooks/useRotaPlani";
import type { FiloSecimi } from "@/lib/rota/atama";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PlanDurumSeridiProps {
  ozet: RotaOzeti;
  /** O gün çıkabilecek filo — şoför sınırı uygulanmış. */
  filo: FiloSecimi;
  loading: boolean;
  /** Sağ uçta duran tercih çekmecesi düğmesi. */
  sag?: ReactNode;
}

/**
 * Günün tek satırlık durumu.
 *
 * Yerini aldığı `RotaOzetSeridi` dört hücreli bir KPI ızgarası + ayrı bir filo
 * satırıydı (~142px) ve en büyük tipi (`2rem`) bekleyen tonajı gösteriyordu.
 * O rakam `duraklar`'ın tamamından türüyor: plandan bağımsız, oturum boyunca
 * hiç değişmiyor. Sayfanın görsel doruğu hareketsiz bir sayıydı ve ekran bu
 * yüzden "araç" değil "gösterge paneli" gibi okunuyordu.
 *
 * Filo/şoför sayısı da iki yerde birden duruyordu (burada ve tercih çubuğunda,
 * 40px arayla, farklı cümleyle). Artık TEK EV burası.
 */
export function PlanDurumSeridi({
  ozet,
  filo,
  loading,
  sag,
}: PlanDurumSeridiProps) {
  const toplamSofor = ozet.soforSayisi.B + ozet.soforSayisi.C;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3.5 py-2 text-[12px] transition-opacity",
        loading && "opacity-40"
      )}
    >
      <Olcu
        etiket="Bekleyen"
        deger={formatKg(Math.round(ozet.toplamKg))}
        baslik="Sevk edilmeyi bekleyen siparişlerin toplam ağırlığı"
      />
      <Olcu
        etiket="Durak"
        deger={formatNumber(ozet.durakSayisi)}
        baslik="Siparişi olan müşteri sayısı"
      />
      <Olcu
        etiket="Hacim"
        deger={`${formatNumber(Math.round(ozet.toplamCuval))} çuval`}
        baslik={
          ozet.filoCuvalKapasitesi > 0
            ? `Çıkacak filonun çuval kapasitesinin %${Math.round(
                (ozet.toplamCuval / ozet.filoCuvalKapasitesi) * 100
              )}'i`
            : "Filo tanımlı değil"
        }
      />

      {/* Koordinatsız müşteri plana giremez — yalnız sorun varken görünsün. */}
      {ozet.koordinatsizSayisi > 0 ? (
        <span
          className="flex shrink-0 items-center gap-1 text-caution"
          title="Koordinatı olmadığı için haritaya konamayan ve plana giremeyen müşteri"
        >
          <MapPinOffIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="font-mono font-medium tabular-nums">
            {formatNumber(ozet.koordinatsizSayisi)}
          </span>
          <span>plana giremiyor</span>
        </span>
      ) : null}

      <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />

      {/*
        Günlük filo araç sayısıyla değil ŞOFÖR sayısıyla sınırlı. Planlayıcının
        hangi kombinasyonu neden seçtiği görünür olmalı, yoksa "neden 4. araç
        boş duruyor" sorusu cevapsız kalır.
      */}
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          filo.yeterli ? "text-muted-foreground" : "text-caution"
        )}
      >
        {filo.yeterli ? null : (
          <AlertTriangleIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        )}
        <span className="shrink-0 font-medium text-foreground">
          {formatNumber(toplamSofor)} şoför / {formatNumber(filo.secilen.length)} araç
        </span>
        <span className="min-w-0 truncate" title={filo.gerekce}>
          {filo.gerekce}
        </span>
      </span>

      <span className="min-w-0 flex-1" />
      {sag}
    </div>
  );
}

function Olcu({
  etiket,
  deger,
  baslik,
}: {
  etiket: string;
  deger: string;
  baslik: string;
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5" title={baslik}>
      <span className="text-muted-foreground">{etiket}</span>
      <span className="font-mono font-medium text-foreground tabular-nums">
        {deger}
      </span>
    </span>
  );
}
