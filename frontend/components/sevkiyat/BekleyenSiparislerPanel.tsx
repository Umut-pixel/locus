"use client";

import { useMemo, useState } from "react";
import { CheckCircle2Icon, ClipboardListIcon, SearchXIcon } from "lucide-react";

import { ScrollBottomFade } from "@/components/ui/ScrollBottomFade";
import { MusteriAdIlce } from "@/components/sevkiyat/MusteriAdIlce";
import { PanelAramaSatiri } from "@/components/sevkiyat/PanelAramaSatiri";
import type { BekleyenSiparisSatiri } from "@/hooks/useSevkiyatRaporu";
import { useScrollBottomFade } from "@/hooks/useScrollBottomFade";
import { aramaFiltrele } from "@/lib/arama";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BekleyenSiparislerPanelProps {
  satirlar: BekleyenSiparisSatiri[];
  loading: boolean;
  className?: string;
  /** Başlığın sağına gömülen kontrol (bekleyen ↔ riskli geçişi). */
  headerExtra?: React.ReactNode;
}

const DURUM_ETIKET: Record<BekleyenSiparisSatiri["durum"], string> = {
  bekleyen: "Bekliyor",
  irsaliyeli: "İrsaliyeli",
};

/**
 * Belge detay sipariş (5450 / 5451 snapshot) — henüz irsaliye/fatura
 * edilmemiş satış siparişleri. Küme 5140 ham Excel ile aynı: yalnız
 * "Bekleyen Sipariş" × Satış; tutar BrutTutar. Alış ve iptal hook'ta elenir.
 *
 * DÖNEM SEÇİCİSİNE BAĞLI DEĞİL — bu bir bakiye, bir dönem toplamı değil.
 * Sayfa altındaki not bunu söylüyordu ama rakamın yanında yazmıyordu ve
 * "tarihi değiştirdim, tutar değişmedi" diye soruldu. Rozet o yüzden brüt
 * tutarın ta yanında: sorunun sorulduğu yer orası.
 *
 * Geçmiş bakiyenin tarihçesi tutulmuyor; döneme göre filtrelemek "o gün ne
 * bekliyordu" değil "o dönemde girilip hâlâ bekleyen ne var" olurdu — başka
 * bir soru. Bilinçli olarak filtrelenmiyor.
 */
export function BekleyenSiparislerPanel({
  satirlar,
  loading,
  className,
  headerExtra,
}: BekleyenSiparislerPanelProps) {
  const [arama, setArama] = useState("");

  // Belge kodu ve temsilci de aranabilir alan: panelde ikisi de gorunuyor
  // ("#12345 - 3 kalem - Ahmet"), gorunen bir seyin aranamamasi sasirtir.
  const gorunenSatirlar = useMemo(
    () =>
      aramaFiltrele(satirlar, arama, (s) => [
        s.musteriAd,
        s.musteriKod,
        s.ilce,
        s.belgeKod,
        s.temsilci,
      ]),
    [satirlar, arama]
  );

  const veriYok = satirlar.length === 0;
  const bos = gorunenSatirlar.length === 0;
  const { wrapperRef, scrollRef } = useScrollBottomFade<HTMLElement, HTMLDivElement>(
    gorunenSatirlar.length
  );

  // Arama aktifken tutar GORUNEN satirlari toplar. Filtrelenmis bir listenin
  // yaninda filtrelenmemis bir toplam durmasi, "bu uc siparis 2,4 milyon mu?"
  // diye okunuyordu; rozet de "filtrelenmis" diye degisiyor ki karismasin.
  const aramaAktif = arama.trim().length > 0;
  const toplamTutar = useMemo(
    () => gorunenSatirlar.reduce((acc, s) => acc + s.toplamTutar, 0),
    [gorunenSatirlar]
  );

  return (
    <section
      ref={wrapperRef}
      className={cn(
        "relative flex min-w-0 flex-col border-b border-border lg:border-r lg:border-b-0",
        className
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border/60 px-3.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <ClipboardListIcon
            className={cn("size-3.5 shrink-0", !bos && "text-caution")}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">Bekleyen siparişler</span>
        </h2>
        {!veriYok ? (
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-caution tabular-nums">
            {formatNumber(satirlar.length)}
          </span>
        ) : null}
        {headerExtra ? <div className="ml-auto shrink-0">{headerExtra}</div> : null}
      </header>

      {!veriYok ? (
        <PanelAramaSatiri
          deger={arama}
          onDegisim={setArama}
          gorunen={gorunenSatirlar.length}
          toplam={satirlar.length}
          placeholder="Müşteri, ilçe, belge no, temsilci…"
          etiket="Bekleyen siparişlerde ara"
        />
      ) : null}

      {!veriYok && !bos ? (
        <div
          className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5"
          aria-label={`${aramaAktif ? "Filtrelenen" : "Bekleyen"} siparişlerin brüt tutarı ${formatCurrency(toplamTutar)}`}
        >
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
              Brüt tutar
            </span>
            {aramaAktif ? (
              <span
                className="shrink-0 cursor-help rounded border border-caution/50 px-1 py-px text-[10.5px] leading-none text-caution"
                title="Arama etkin — tutar yalnız listelenen siparişleri topluyor."
              >
                filtrelenmiş
              </span>
            ) : (
              <span
                className="shrink-0 cursor-help rounded border border-border/70 px-1 py-px text-[10.5px] leading-none text-muted-foreground"
                title="Bekleyen siparişler anlık bakiyedir — dönem seçicisinden etkilenmez. Sayfadaki diğer paneller seçili dönemi gösterir."
              >
                tüm dönemler
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-[13px] font-medium text-caution tabular-nums">
            {formatCurrency(toplamTutar)}
          </span>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-40"
        )}
      >
        {bos ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            {veriYok ? (
              <>
                <CheckCircle2Icon
                  className="size-6 text-muted-foreground"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <p className="text-[13px] text-muted-foreground">
                  Bekleyen satış siparişi yok.
                </p>
              </>
            ) : (
              <>
                <SearchXIcon
                  className="size-6 text-muted-foreground"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <p className="text-[13px] text-muted-foreground">
                  “{arama.trim()}” ile eşleşen sipariş yok.
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {gorunenSatirlar.map((s) => (
              <li key={s.belgeKod} className="flex min-w-0 items-center gap-3 px-3.5 py-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    s.durum === "bekleyen" ? "bg-caution" : "bg-locus-blue-mid"
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <MusteriAdIlce
                    ad={s.musteriAd ?? s.musteriKod}
                    ilce={s.ilce}
                    className="text-[13px] text-foreground"
                  />
                  <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                    #{s.belgeKod} · {s.kalemSayisi} kalem
                    {s.temsilci ? ` · ${s.temsilci}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-[12.5px] font-medium text-foreground tabular-nums">
                    {formatCurrency(s.toplamTutar)}
                  </span>
                  <span
                    className={cn(
                      "text-[11px]",
                      s.durum === "bekleyen" ? "text-caution" : "text-locus-blue-mid"
                    )}
                  >
                    {DURUM_ETIKET[s.durum]}
                    {s.gecenGun != null ? ` · ${s.gecenGun} gün` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ScrollBottomFade />
    </section>
  );
}
