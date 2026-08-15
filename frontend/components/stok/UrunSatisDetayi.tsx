"use client";

import { useUrunSatisDagilimi } from "@/hooks/useUrunSatisDagilimi";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UrunSatisDetayiProps {
  urunKodu: string;
  urun: string;
}

/** Genişletilmiş satırda görünen üst sınır — geri kalan tek özet satırında. */
const MAX_GORUNEN_MUSTERI = 6;

/**
 * Stok tablosunda bir ürün satırı genişletilince açılan panel: bu ürünü
 * hangi petshop'lar ne kadar satın almış.
 *
 * Sıralı tek-renk bar listesi — pasta DEĞİL. Ürün başına müşteri sayısı 0'dan
 * 231'e kadar değişiyor (98 üründen 67'si 20'den fazla alıcıya sahip); bir
 * pastada ilk 5'i göstermek "Diğer" dilimini çoğu zaman payın %70+'ını
 * taşıyan, hikayesiz bir yığına çeviriyordu. Büyüklük karşılaştırması —
 * "kim en çok aldı" — barın işi, pastanın değil (bkz. dataviz skill,
 * choosing-a-form.md).
 */
export function UrunSatisDetayi({ urunKodu, urun }: UrunSatisDetayiProps) {
  const { musteriler, toplamTutar, toplamAdet, musteriSayisi, loading, error } =
    useUrunSatisDagilimi(urunKodu);

  if (loading) {
    return (
      <div className="px-6 py-5 text-[13px] text-muted-foreground">
        Satış geçmişi yükleniyor…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-5 text-[13px] text-destructive">{error}</div>
    );
  }

  if (musteriler.length === 0) {
    return (
      <div className="px-6 py-5 text-[13px] text-muted-foreground">
        <span className="text-foreground">{urun}</span> için satış geçmişi
        bulunamadı.
      </div>
    );
  }

  const gorunen = musteriler.slice(0, MAX_GORUNEN_MUSTERI);
  const kalan = musteriler.slice(MAX_GORUNEN_MUSTERI);
  const kalanTutar = kalan.reduce((a, m) => a + m.tutar, 0);
  const enBuyukTutar = gorunen[0]?.tutar ?? 0;

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]">
        <span className="text-muted-foreground">
          <span className="text-foreground">{urun}</span> — kime satılmış
        </span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {formatCurrency(toplamTutar)}
          <span className="ml-1 font-sans font-normal text-muted-foreground">
            toplam
          </span>
        </span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {formatNumber(toplamAdet)}
          <span className="ml-1 font-sans font-normal text-muted-foreground">
            adet
          </span>
        </span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {formatNumber(musteriSayisi)}
          <span className="ml-1 font-sans font-normal text-muted-foreground">
            petshop
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {gorunen.map((m) => (
          <li key={m.musteriKod} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] text-foreground">
                {m.musteriAd}
              </span>
              <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums">
                {formatCurrency(m.tutar)}
                <span className="ml-1.5 text-[11px]">
                  · {formatNumber(m.adet)} adet
                </span>
              </span>
            </div>
            <span
              className="block h-2 w-full overflow-hidden rounded-[2px] bg-secondary"
              role="img"
              aria-label={`${m.musteriAd}: ${formatCurrency(m.tutar)}`}
            >
              <span
                className="block h-full rounded-r-[4px] transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.max(
                    enBuyukTutar > 0 ? (m.tutar / enBuyukTutar) * 100 : 0,
                    m.tutar > 0 ? 1.5 : 0
                  )}%`,
                  backgroundColor: "var(--chart-stok)",
                }}
              />
            </span>
          </li>
        ))}
      </ul>

      {kalan.length > 0 ? (
        <p
          className={cn(
            "border-t border-border/60 pt-2 text-[12px] text-muted-foreground"
          )}
        >
          + {formatNumber(kalan.length)} diğer petshop, toplam{" "}
          {formatCurrency(kalanTutar)}
        </p>
      ) : null}
    </div>
  );
}
