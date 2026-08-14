"use client";

import { AlertTriangleIcon, BoxesIcon, PackageIcon, TagIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { StokOzet as StokOzetVerisi } from "@/hooks/useStokRaporu";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StokOzetProps {
  ozet: StokOzetVerisi;
  loading: boolean;
  /** "Stokta yok" kutusu tıklanınca filtreyi açar — widget aynı zamanda kestirme. */
  onStoktaYokClick: () => void;
  stoktaYokAktif: boolean;
}

/**
 * Sayfanın tek hero figürü toplam stok değeri; kalanlar destekleyici stat
 * kutuları. Büyük sayılarda `tabular-nums` YOK — eşit genişlikli rakamlar
 * display boyutunda araları açıp sayıyı dağıtıyor; hizalanması gereken
 * yerler (tablo, bar etiketleri) tabular kalıyor.
 */
export function StokOzet({
  ozet,
  loading,
  onStoktaYokClick,
  stoktaYokAktif,
}: StokOzetProps) {
  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
      <div className="flex flex-col justify-center gap-1 bg-background px-3.5 py-4">
        <span className="text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          Toplam stok değeri
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold text-foreground transition-opacity",
            loading && "opacity-40"
          )}
        >
          {formatCurrency(ozet.toplamBrut)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          KDV dahil {formatCurrency(ozet.toplamKdvli)}
        </span>
      </div>

      <StatKutusu
        icon={PackageIcon}
        etiket="Ürün"
        deger={formatNumber(ozet.urunAdet)}
        altBilgi={`${formatNumber(ozet.toplamMiktar)} adet stok`}
        loading={loading}
      />

      <StatKutusu
        icon={TagIcon}
        etiket="Marka / kategori"
        deger={`${formatNumber(ozet.markaAdet)} / ${formatNumber(ozet.kategoriAdet)}`}
        altBilgi="dağılım grafiğinde kırılıyor"
        loading={loading}
      />

      {/* Durum rengi yalnızca durum anlatır; grafik hue'suyla asla karışmaz. */}
      <button
        type="button"
        onClick={onStoktaYokClick}
        aria-pressed={stoktaYokAktif}
        className={cn(
          "flex flex-col justify-center gap-1 px-3.5 py-4 text-left transition-colors",
          "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          stoktaYokAktif ? "bg-destructive/10" : "bg-background"
        )}
        title={
          stoktaYokAktif
            ? "Stokta yok filtresi açık — kapatmak için tıklayın"
            : "Yalnızca stokta olmayan ürünleri göster"
        }
      >
        <span className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          <AlertTriangleIcon
            className={cn("size-3.5", ozet.stoktaYokAdet > 0 && "text-destructive")}
            strokeWidth={1.75}
            aria-hidden
          />
          Stokta yok
        </span>
        <span
          className={cn(
            "font-sans text-[2rem] leading-none font-semibold transition-opacity",
            ozet.stoktaYokAdet > 0 ? "text-destructive" : "text-foreground",
            loading && "opacity-40"
          )}
        >
          {formatNumber(ozet.stoktaYokAdet)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {ozet.urunAdet > 0
            ? `${formatNumber(ozet.urunAdet)} üründen`
            : "ürün yok"}
        </span>
      </button>
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

/** Boş durumda ikon tutarlılığı için dışa aç — sayfa başlığında da kullanılıyor. */
export const StokSayfaIkonu = BoxesIcon;
