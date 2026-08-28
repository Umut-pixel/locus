"use client";

import {
  BanknoteIcon,
  CalendarRangeIcon,
  CreditCardIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { TahsilatOzet as TahsilatOzetVerisi } from "@/hooks/useTahsilatRaporu";
import { useCountUp } from "@/hooks/useCountUp";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TahsilatOzetProps {
  ozet: TahsilatOzetVerisi;
  loading: boolean;
}

export function TahsilatOzet({ ozet, loading }: TahsilatOzetProps) {
  const donem = useCountUp(ozet.donemTahsilat);
  const son7 = useCountUp(ozet.son7Gun);
  const odenmemis = useCountUp(ozet.odenmemisTutar);

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
          {formatCurrency(donem)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          Ödenen belgeler · {formatNumber(ozet.musteriAdet)} müşteri
        </span>
      </div>

      <StatKutusu
        icon={CalendarRangeIcon}
        etiket="Son 7 gün"
        deger={formatCurrency(son7)}
        altBilgi="Ödenen nakit girişi"
        loading={loading}
      />

      <StatKutusu
        icon={WalletIcon}
        etiket="Ödenmedi"
        deger={formatCurrency(odenmemis)}
        altBilgi={`${formatNumber(ozet.odenmemisAdet)} çek/senet belgesi`}
        vurgu={ozet.odenmemisTutar > 0}
        vurguSinif="text-amber-400"
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
  deger: string;
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
