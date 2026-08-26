"use client";

import { ClockIcon, RouteIcon, TruckIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { SevkiyatOzet as SevkiyatOzetVerisi } from "@/hooks/useSevkiyatRaporu";
import { useCountUp } from "@/hooks/useCountUp";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SevkiyatOzetProps {
  ozet: SevkiyatOzetVerisi;
  loading: boolean;
}

/** Sayfanın hero figürü riskli müşteri sayısı — StokOzet.tsx'teki KPI şeridi deseniyle aynı iskelet. */
export function SevkiyatOzet({ ozet, loading }: SevkiyatOzetProps) {
  const riskli = useCountUp(ozet.riskDagilimi.riskli);
  const aktifRut = useCountUp(ozet.aktifRutSayisi);
  const musteriSayisi = useCountUp(ozet.musteriSayisi);

  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
      <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
        <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          Riskli müşteri
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold transition-opacity",
            ozet.riskDagilimi.riskli > 0 ? "text-destructive" : "text-foreground",
            loading && "opacity-40"
          )}
        >
          {formatNumber(Math.round(riskli))}
        </span>
        <span className="text-[12px] text-muted-foreground">90+ gün teslimat almadı</span>
      </div>

      <StatKutusu
        icon={ClockIcon}
        etiket="Ortalama gecikme"
        deger={
          ozet.ortalamaGecikmeGun != null ? `${formatNumber(ozet.ortalamaGecikmeGun)} gün` : "—"
        }
        altBilgi="son teslimattan bu yana"
        loading={loading}
      />

      <StatKutusu
        icon={RouteIcon}
        etiket="Aktif rut"
        deger={formatNumber(Math.round(aktifRut))}
        altBilgi="rut kodu atanmış müşterilerde"
        loading={loading}
      />

      <StatKutusu
        icon={TruckIcon}
        etiket="Müşteri"
        deger={formatNumber(Math.round(musteriSayisi))}
        altBilgi="bayi bölgesi, tüm senkron"
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
}: {
  icon: LucideIcon;
  etiket: string;
  deger: string;
  altBilgi: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
      <span className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
        {etiket}
      </span>
      <span
        className={cn(
          "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
          loading && "opacity-40"
        )}
      >
        {deger}
      </span>
      <span className="text-[12px] text-muted-foreground">{altBilgi}</span>
    </div>
  );
}
