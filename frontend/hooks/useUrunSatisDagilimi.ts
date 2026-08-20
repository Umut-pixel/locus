"use client";

import { useEffect, useState } from "react";

import { KEEP_BELGE_TIP } from "@/lib/import/parse-belge-detay";
import { sayiyaCevir } from "@/lib/import/utils";
import { PANORAMA_BELGE_DETAY_VIEW, supabase } from "@/lib/supabase";

const BELGE_TIPLERI = [...KEEP_BELGE_TIP];

function sayi(value: unknown): number {
  return sayiyaCevir(value) ?? 0;
}

export interface UrunMusteriSatiri {
  musteriKod: string;
  musteriAd: string;
  tutar: number;
  adet: number;
}

export interface UrunSatisDagilimiSonucu {
  /** Tutara göre azalan sıralı — tüm müşteriler, kesme yapılmaz. */
  musteriler: UrunMusteriSatiri[];
  toplamTutar: number;
  toplamAdet: number;
  musteriSayisi: number;
  loading: boolean;
  error: string | null;
}

const BASLANGIC_DURUMU: UrunSatisDagilimiSonucu = {
  musteriler: [],
  toplamTutar: 0,
  toplamAdet: 0,
  musteriSayisi: 0,
  loading: true,
  error: null,
};

/**
 * Bir ürünü hangi müşterilerin satın aldığı — BelgeDetayRaporu'ndan (5450)
 * ürün koduna göre canlı sorgu.
 *
 * `urunKodu` string zorunlu: bu hook yalnızca StokTable'ın genişletilmiş
 * satırında, `UrunSatisDetayi` mount edildiğinde çağrılıyor — satır
 * kapanınca bileşen tamamen unmount olup farklı bir ürün açıldığında yeni
 * bir instance'la yeniden mount ediliyor. Yani hook hiçbir zaman "aynı
 * instance'ta null'a dönme" durumuyla karşılaşmıyor; null kabul edip
 * effect içinde resetlemek gereksiz karmaşıklık olurdu.
 */
export function useUrunSatisDagilimi(
  urunKodu: string
): UrunSatisDagilimiSonucu {
  const [sonuc, setSonuc] = useState<UrunSatisDagilimiSonucu>(BASLANGIC_DURUMU);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from(PANORAMA_BELGE_DETAY_VIEW)
      .select("musteri_kod,musteri_unvan,musteri_kisa_ad,nettutar,miktar")
      .eq("urun_kodu", urunKodu)
      .in("belge_tip", BELGE_TIPLERI)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSonuc({
            musteriler: [],
            toplamTutar: 0,
            toplamAdet: 0,
            musteriSayisi: 0,
            loading: false,
            error: `Satış verisi yüklenemedi: ${error.message}`,
          });
          return;
        }

        const ham = (data ?? []) as unknown as Record<string, unknown>[];
        const havuz = new Map<string, { ad: string; tutar: number; adet: number }>();
        let toplamTutar = 0;
        let toplamAdet = 0;

        for (const row of ham) {
          const kod = String(row.musteri_kod ?? "").trim();
          if (!kod) continue;
          const ad =
            (row.musteri_kisa_ad as string | null) ||
            (row.musteri_unvan as string | null) ||
            kod;
          const tutar = sayi(row.nettutar);
          const adet = sayi(row.miktar);

          const mevcut = havuz.get(kod) ?? { ad, tutar: 0, adet: 0 };
          mevcut.tutar += tutar;
          mevcut.adet += adet;
          havuz.set(kod, mevcut);

          toplamTutar += tutar;
          toplamAdet += adet;
        }

        const musteriler = [...havuz.entries()]
          .map(([musteriKod, v]) => ({
            musteriKod,
            musteriAd: v.ad,
            tutar: v.tutar,
            adet: v.adet,
          }))
          .sort((a, b) => b.tutar - a.tutar);

        setSonuc({
          musteriler,
          toplamTutar,
          toplamAdet,
          musteriSayisi: musteriler.length,
          loading: false,
          error: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [urunKodu]);

  return sonuc;
}
