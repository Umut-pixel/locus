"use client";

import { useState, type ReactNode } from "react";
import {
  BanknoteIcon,
  CalendarRangeIcon,
  CreditCardIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { TahsilatOzet as TahsilatOzetVerisi } from "@/hooks/useTahsilatRaporu";
import { DegisimRozeti } from "@/components/ui/degisim-rozeti";
import { SegmentedSwitch } from "@/components/ui/segmented-switch";
import { TickerNumber } from "@/components/ui/ticker-number";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type SonPencere = "7g" | "1ay";

const SON_PENCERE_SECENEKLERI = [
  { value: "7g" as const, label: "7 gün", title: "Bugünden geriye 7 gün" },
  { value: "1ay" as const, label: "1 ay", title: "Bugünden geriye 30 gün" },
];

interface TahsilatOzetProps {
  ozet: TahsilatOzetVerisi;
  loading: boolean;
  /** Seçili dönemin okunabilir etiketi — KPI'ın hangi pencereyi anlattığı. */
  donemEtiketi: string;
}

export function TahsilatOzet({ ozet, loading, donemEtiketi }: TahsilatOzetProps) {
  const [sonPencere, setSonPencere] = useState<SonPencere>("7g");
  // İki ayrı sayacı takas etmek yerine tek hedef: pencere değişince sayaç
  // eski değerden yenisine sayıyor, sert kesme olmuyor.
  const sonHedef = sonPencere === "7g" ? ozet.son7Gun : ozet.son1Ay;

  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
      <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
        <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          Dönem tahsilatı
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
            loading && "opacity-40"
          )}
        >
          <TickerNumber value={ozet.donemTahsilat} format={formatCurrency} />
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
          <DegisimRozeti oran={ozet.donemDegisim} />
          {donemEtiketi} · ödenen · {formatNumber(ozet.musteriAdet)} müşteri
        </span>
      </div>

      <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
            <CalendarRangeIcon
              className="size-3.5 shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            Son
          </span>
          <SegmentedSwitch
            value={sonPencere}
            onChange={setSonPencere}
            options={SON_PENCERE_SECENEKLERI}
            ariaLabel="Son tahsilat penceresi"
          />
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
            loading && "opacity-40"
          )}
        >
          <TickerNumber value={sonHedef} format={formatCurrency} />
        </span>
        <span className="text-[12px] text-muted-foreground">
          Ödenen nakit girişi
        </span>
      </div>

      <StatKutusu
        icon={WalletIcon}
        etiket="Ödenmedi"
        deger={<TickerNumber value={ozet.odenmemisTutar} format={formatCurrency} />}
        altBilgi={`${formatNumber(ozet.odenmemisAdet)} çek/senet belgesi`}
        vurgu={ozet.odenmemisTutar > 0}
        vurguSinif="text-caution"
        loading={loading}
      />

      <StatKutusu
        icon={CreditCardIcon}
        etiket="KK / EFT / nakit"
        deger={`${yuzde(ozet.kkPay)} · ${yuzde(ozet.eftPay)} · ${yuzde(ozet.nakitPay)}`}
        altBilgi="Ödenen tutar payı"
        loading={loading}
        kucukDeger
      />
    </div>
  );
}

function yuzde(pay: number): string {
  if (!Number.isFinite(pay) || pay <= 0) return "%0";
  return `%${Math.round(pay * 100)}`;
}

function StatKutusu({
  icon: Icon,
  etiket,
  deger,
  altBilgi,
  loading,
  vurgu = false,
  vurguSinif = "text-destructive",
  kucukDeger = false,
}: {
  icon: LucideIcon;
  etiket: string;
  deger: ReactNode;
  altBilgi: string;
  loading: boolean;
  vurgu?: boolean;
  vurguSinif?: string;
  kucukDeger?: boolean;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
      <span className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        <Icon
          className={cn("size-3.5", vurgu && vurguSinif)}
          strokeWidth={1.75}
          aria-hidden
        />
        {etiket}
      </span>
      <span
        className={cn(
          "font-sans leading-none font-semibold transition-opacity",
          kucukDeger ? "text-[1.35rem]" : "text-[2rem]",
          vurgu ? vurguSinif : "text-foreground",
          loading && "opacity-40"
        )}
      >
        {deger}
      </span>
      <span className="text-[12px] text-muted-foreground">{altBilgi}</span>
    </div>
  );
}

export const TahsilatSayfaIkonu = BanknoteIcon;
