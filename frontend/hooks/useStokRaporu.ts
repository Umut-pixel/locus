"use client";

import { useEffect, useMemo, useState } from "react";

import { sayiyaCevir } from "@/lib/import/utils";
import {
  PANORAMA_DETAYLI_STOK_RAPORU_VIEW,
  supabase,
} from "@/lib/supabase";

/** DetayliStokRaporu (5430) — tazelik rozeti bu rapor id'sine bakar. */
export const STOK_REPORT_ID = 5430;

/**
 * Landing tablosunun tüm kolonları text. Sayısal alanlar Panorama'dan nokta
 * ondalıklı geliyor ("929473.2"); `sayiyaCevir` bu biçimi de Türkçe virgüllü
 * biçimi de doğru çözdüğü için burada ayrı bir parser tutmuyoruz.
 */
function sayi(value: unknown): number {
  return sayiyaCevir(value) ?? 0;
}

function metin(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export interface StokSatiri {
  urunKodu: string;
  urun: string;
  depoAd: string | null;
  marka: string | null;
  kategori: string | null;
  birim: string | null;
  kdvOran: number;
  fiyat: number;
  miktar: number;
  brutTutar: number;
  kdvliTutar: number;
}

export interface StokFilters {
  marka: string | null;
  kategori: string | null;
  arama: string;
  /** "Stokta Yok" widget'ından da tetiklenir — tek filtre satırı her şeyi kapsar. */
  sadeceStoktaYok: boolean;
}

export const EMPTY_STOK_FILTERS: StokFilters = {
  marka: null,
  kategori: null,
  arama: "",
  sadeceStoktaYok: false,
};

export function stokFiltersActive(f: StokFilters): boolean {
  return (
    f.marka != null ||
    f.kategori != null ||
    f.arama.trim() !== "" ||
    f.sadeceStoktaYok
  );
}

export type StokSortField = "urun" | "miktar" | "brutTutar" | "fiyat";
export interface StokSort {
  field: StokSortField;
  dir: "asc" | "desc";
}

export const VARSAYILAN_STOK_SORT: StokSort = {
  field: "brutTutar",
  dir: "desc",
};

export interface StokOzet {
  urunAdet: number;
  stoktaYokAdet: number;
  toplamMiktar: number;
  toplamBrut: number;
  toplamKdvli: number;
  markaAdet: number;
  kategoriAdet: number;
}

/** Dağılım grafiği hangi boyutta kırılacak. */
export type StokBoyut = "marka" | "kategori";

export interface DagilimDilimi {
  ad: string;
  brutTutar: number;
  miktar: number;
  urunAdet: number;
  /** En büyük dilime göre 0–1 — bar uzunluğu. */
  oran: number;
  /** Toplam stok değeri içindeki payı, 0–1. */
  pay: number;
}

interface StokRaporuState {
  tumSatirlar: StokSatiri[];
  loading: boolean;
  error: string | null;
}

// urun_hiyerarsi2 bilinçli olarak yok: 5430'un tüm satırlarında boş geliyor.
const SELECT_KOLONLARI =
  "urun_kodu,urun,depo_ad,grup,urun_hiyerarsi1," +
  "birim,kdv,fiyat,miktar,brut_tutar,kdvli_tutar";

/**
 * Stok raporu tek seferde çekilir (view "son completed sync"i döndürüyor,
 * ~100 satır) ve filtreleme/sıralama bellekte yapılır. Sunucu tarafı
 * sayfalama bu boyutta hem gereksiz hem de KPI/dağılımı filtreyle senkron
 * tutmayı zorlaştırırdı — tek slice, tüm görseller aynı veriden.
 */
export function useStokRaporu(filters: StokFilters, sort: StokSort) {
  const [state, setState] = useState<StokRaporuState>({
    tumSatirlar: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    supabase
      .from(PANORAMA_DETAYLI_STOK_RAPORU_VIEW)
      .select(SELECT_KOLONLARI)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({
            tumSatirlar: [],
            loading: false,
            error: `Stok verisi yüklenemedi: ${error.message}`,
          });
          return;
        }
        // supabase-js seçim string'ini çözemediğinde `data`yı hata tipiyle
        // birleştiriyor; satırlar zaten aşağıda alan alan doğrulanıyor.
        const ham = (data ?? []) as unknown as Record<string, unknown>[];
        const satirlar: StokSatiri[] = ham.map((row) => {
          return {
            urunKodu: metin(row.urun_kodu) ?? "",
            urun: metin(row.urun) ?? "—",
            depoAd: metin(row.depo_ad),
            marka: metin(row.grup),
            kategori: metin(row.urun_hiyerarsi1),
            birim: metin(row.birim),
            kdvOran: sayi(row.kdv),
            fiyat: sayi(row.fiyat),
            miktar: sayi(row.miktar),
            brutTutar: sayi(row.brut_tutar),
            kdvliTutar: sayi(row.kdvli_tutar),
          };
        });
        setState({ tumSatirlar: satirlar, loading: false, error: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { tumSatirlar, loading, error } = state;

  /** Seçenekler filtrelenmemiş kümeden — bir filtre diğerinin şıklarını yok etmesin. */
  const markaSecenekleri = useMemo(
    () => tekilSirali(tumSatirlar.map((s) => s.marka)),
    [tumSatirlar]
  );
  const kategoriSecenekleri = useMemo(
    () => tekilSirali(tumSatirlar.map((s) => s.kategori)),
    [tumSatirlar]
  );

  const filtrelenmis = useMemo(() => {
    const arama = filters.arama.trim().toLocaleLowerCase("tr");
    return tumSatirlar.filter((s) => {
      if (filters.marka != null && s.marka !== filters.marka) return false;
      if (filters.kategori != null && s.kategori !== filters.kategori) return false;
      if (filters.sadeceStoktaYok && s.miktar > 0) return false;
      if (arama) {
        const havuz = `${s.urun} ${s.urunKodu} ${s.marka ?? ""}`.toLocaleLowerCase(
          "tr"
        );
        if (!havuz.includes(arama)) return false;
      }
      return true;
    });
  }, [tumSatirlar, filters]);

  const satirlar = useMemo(() => {
    const yon = sort.dir === "asc" ? 1 : -1;
    return [...filtrelenmis].sort((a, b) => {
      if (sort.field === "urun") {
        return a.urun.localeCompare(b.urun, "tr") * yon;
      }
      const fark = a[sort.field] - b[sort.field];
      // Eşitlikte ürün adı — sıralama render'lar arası kaymasın.
      return fark !== 0 ? fark * yon : a.urun.localeCompare(b.urun, "tr");
    });
  }, [filtrelenmis, sort]);

  const ozet = useMemo<StokOzet>(() => {
    let toplamBrut = 0;
    let toplamKdvli = 0;
    let toplamMiktar = 0;
    let stoktaYokAdet = 0;
    const markalar = new Set<string>();
    const kategoriler = new Set<string>();
    for (const s of filtrelenmis) {
      toplamBrut += s.brutTutar;
      toplamKdvli += s.kdvliTutar;
      toplamMiktar += s.miktar;
      if (s.miktar <= 0) stoktaYokAdet += 1;
      if (s.marka) markalar.add(s.marka);
      if (s.kategori) kategoriler.add(s.kategori);
    }
    return {
      urunAdet: filtrelenmis.length,
      stoktaYokAdet,
      toplamMiktar,
      toplamBrut,
      toplamKdvli,
      markaAdet: markalar.size,
      kategoriAdet: kategoriler.size,
    };
  }, [filtrelenmis]);

  /** Stokta olmayan ürünler — filtreden bağımsız değil, aynı slice üzerinden. */
  const stoktaYokSatirlar = useMemo(
    () =>
      filtrelenmis
        .filter((s) => s.miktar <= 0)
        .sort((a, b) => b.fiyat - a.fiyat),
    [filtrelenmis]
  );

  return {
    satirlar,
    tumSatirlar,
    ozet,
    stoktaYokSatirlar,
    markaSecenekleri,
    kategoriSecenekleri,
    loading,
    error,
  };
}

/** Dağılım dilimleri — bar uzunluğu en büyüğe, pay toplama göre. */
export function stokDagilimi(
  satirlar: StokSatiri[],
  boyut: StokBoyut
): DagilimDilimi[] {
  const havuz = new Map<string, { brutTutar: number; miktar: number; urunAdet: number }>();
  for (const s of satirlar) {
    const ad = (boyut === "marka" ? s.marka : s.kategori) ?? "Tanımsız";
    const mevcut = havuz.get(ad) ?? { brutTutar: 0, miktar: 0, urunAdet: 0 };
    mevcut.brutTutar += s.brutTutar;
    mevcut.miktar += s.miktar;
    mevcut.urunAdet += 1;
    havuz.set(ad, mevcut);
  }
  const dilimler = [...havuz.entries()]
    .map(([ad, v]) => ({ ad, ...v }))
    .sort((a, b) => b.brutTutar - a.brutTutar);

  const enBuyuk = dilimler[0]?.brutTutar ?? 0;
  const toplam = dilimler.reduce((a, d) => a + d.brutTutar, 0);
  return dilimler.map((d) => ({
    ...d,
    oran: enBuyuk > 0 ? d.brutTutar / enBuyuk : 0,
    pay: toplam > 0 ? d.brutTutar / toplam : 0,
  }));
}

function tekilSirali(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v != null))].sort((a, b) =>
    a.localeCompare(b, "tr")
  );
}
