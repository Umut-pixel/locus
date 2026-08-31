"use client";

import {
  BanknoteIcon,
  CalendarRangeIcon,
  CircleDollarSignIcon,
  ClipboardListIcon,
  ReceiptTextIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { type FinansalOzet as FinansalOzetVerisi } from "@/hooks/useFinansalRaporu";
import { useCountUp } from "@/hooks/useCountUp";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FinansalOzetProps {
  ozet: FinansalOzetVerisi;
  loading: boolean;
}

/**
 * Sayfanın hero figürü toplam açık bakiye (borç riski en aksiyona dönük
 * rakam) — StokOzet.tsx'teki KPI şeridi deseniyle birebir aynı iskelet.
 */
export function FinansalOzet({ ozet, loading }: FinansalOzetProps) {
  const toplamAcikBakiye = useCountUp(ozet.toplamAcikBakiye);
  const bekleyenSiparisNetTutar = useCountUp(ozet.bekleyenSiparisNetTutar);
  const toplamBrutCiro = useCountUp(ozet.toplamBrutCiro);
  const toplamNetCiroKdvDahil = useCountUp(ozet.toplamNetCiroKdvDahil);
  const aylikNetCiro = useCountUp(ozet.aylikNetCiro);
  const donemTahsilat = useCountUp(ozet.donemTahsilat);

  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-3 xl:grid-cols-6">
      <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
        <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          Toplam açık bakiye
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
            loading && "opacity-40"
          )}
        >
          {formatCurrency(toplamAcikBakiye)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {formatNumber(ozet.borcluMusteriSayisi)} müşteride açık bakiye
        </span>
      </div>

      <StatKutusu
        icon={ClipboardListIcon}
        etiket="Bekleyen sipariş"
        deger={formatCurrency(bekleyenSiparisNetTutar)}
        altBilgi={`${formatNumber(ozet.bekleyenSiparisBelgeSayisi)} belge · Brüt, iskonto ve KDV hariç`}
        vurgu={ozet.bekleyenSiparisNetTutar > 0}
        vurguSinif="text-caution"
        loading={loading}
      />

      <StatKutusu
        icon={CircleDollarSignIcon}
        etiket="Brüt ciro"
        deger={formatCurrency(toplamBrutCiro)}
        altBilgi="İskonto öncesi, KDV dahil"
        loading={loading}
      />

      <StatKutusu
        icon={WalletIcon}
        etiket="Net ciro (KDV dahil)"
        deger={formatCurrency(toplamNetCiroKdvDahil)}
        altBilgi="KDV dahil, güncel senkron"
        loading={loading}
      />

      <StatKutusu
        icon={CalendarRangeIcon}
        etiket="1 aylık ciro"
        deger={formatCurrency(aylikNetCiro)}
        altBilgi="Ay başından bugüne, KDV dahil"
        loading={loading}
      />

      <StatKutusu
        icon={BanknoteIcon}
        etiket="Dönem tahsilatı"
        deger={formatCurrency(donemTahsilat)}
        altBilgi="Ay başından bugüne, iskonto öncesi brüt"
        loading={loading}
      />
    </div>
  );
}

function StatKutusu({
  icon: Icon,
  etiket,
  deger,
  altBilgi,
  loading,
  vurgu = false,
  vurguSinif = "text-destructive",
}: {
  icon: LucideIcon;
  etiket: string;
  deger: string;
  altBilgi: string;
  loading: boolean;
  vurgu?: boolean;
  vurguSinif?: string;
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
          "font-sans text-[2rem] leading-none font-semibold transition-opacity",
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

/** Boş durum / başlık ikonu tutarlılığı için dışa aç. */
export const FinansalSayfaIkonu = ReceiptTextIcon;
