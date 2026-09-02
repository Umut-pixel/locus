"use client";

import {
  AlertTriangleIcon,
  MapPinOffIcon,
  PackageIcon,
  TruckIcon,
  UserIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { RotaOzeti } from "@/hooks/useRotaPlani";
import { useCountUp } from "@/hooks/useCountUp";
import type { FiloSecimi } from "@/lib/rota/atama";
import { formatKg, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RotaOzetSeridiProps {
  ozet: RotaOzeti;
  /** O gün çıkabilecek filo — şoför sınırı uygulanmış. */
  filo: FiloSecimi;
  loading: boolean;
}

/** SevkiyatOzet.tsx'teki KPI şeridi iskeletiyle aynı — hero figür bekleyen yük. */
export function RotaOzetSeridi({ ozet, filo, loading }: RotaOzetSeridiProps) {
  const kg = useCountUp(ozet.toplamKg);
  const cuval = useCountUp(ozet.toplamCuval);
  const durak = useCountUp(ozet.durakSayisi);

  const filoOrani =
    ozet.filoCuvalKapasitesi > 0
      ? Math.round((ozet.toplamCuval / ozet.filoCuvalKapasitesi) * 100)
      : null;

  const toplamSofor = ozet.soforSayisi.B + ozet.soforSayisi.C;

  return (
    <>
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
      <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
        <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          Bekleyen yük
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
            loading && "opacity-40"
          )}
        >
          {formatKg(Math.round(kg))}
        </span>
        <span className="text-[12px] text-muted-foreground">
          sevk edilmeyi bekleyen sipariş
        </span>
      </div>

      <StatKutusu
        icon={PackageIcon}
        etiket="Hacim"
        deger={`${formatNumber(Math.round(cuval))} çuval`}
        altBilgi={
          filoOrani != null
            ? `filo kapasitesinin %${filoOrani}'i`
            : "filo tanımlı değil"
        }
        loading={loading}
        vurgu={filoOrani != null && filoOrani > 100}
      />

      <StatKutusu
        icon={TruckIcon}
        etiket="Durak"
        deger={formatNumber(Math.round(durak))}
        altBilgi="siparişi olan müşteri"
        loading={loading}
      />

      <StatKutusu
        icon={MapPinOffIcon}
        etiket="Plana giremeyen"
        deger={formatNumber(ozet.koordinatsizSayisi)}
        altBilgi="koordinatı olmayan müşteri"
        loading={loading}
        vurgu={ozet.koordinatsizSayisi > 0}
      />
    </div>

    {/*
      Günlük filo araç sayısıyla değil ŞOFÖR sayısıyla sınırlı: 3 şoför var ve
      sınıflar arası geçmiyorlar, yani Kangoo ile Transit aynı gün çıkamaz.
      Planlayıcının hangi kombinasyonu neden seçtiği burada görünür olmalı,
      yoksa "neden 4. araç boş duruyor" sorusu cevapsız kalır.
    */}
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3.5 py-2 text-[12px]",
        filo.yeterli ? "text-muted-foreground" : "text-amber-400"
      )}
    >
      {filo.yeterli ? (
        <UserIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      ) : (
        <AlertTriangleIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
      )}
      <span className="font-medium text-foreground">
        {formatNumber(toplamSofor)} şoför · {formatNumber(filo.secilen.length)} araç
      </span>
      {filo.secilen.length > 0 ? (
        <span className="text-muted-foreground">
          {filo.secilen.map((a) => a.ad).join(" · ")}
        </span>
      ) : null}
      <span className={filo.yeterli ? "text-muted-foreground" : undefined}>
        {filo.gerekce}
      </span>
    </div>
    </>
  );
}

function StatKutusu({
  icon: Icon,
  etiket,
  deger,
  altBilgi,
  loading,
  vurgu = false,
}: {
  icon: LucideIcon;
  etiket: string;
  deger: string;
  altBilgi: string;
  loading: boolean;
  vurgu?: boolean;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
      <span className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        {etiket}
      </span>
      <span
        className={cn(
          "font-sans text-[1.5rem] leading-none font-semibold transition-opacity",
          vurgu ? "text-amber-400" : "text-foreground",
          loading && "opacity-40"
        )}
      >
        {deger}
      </span>
      <span className="text-[12px] text-muted-foreground">{altBilgi}</span>
    </div>
  );
}
