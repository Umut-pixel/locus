"use client";

import { useEffect, useMemo, useState } from "react";

import { parseIslemTarihi } from "@/lib/import/parse-belge-detay";
import { sayiyaCevir } from "@/lib/import/utils";
import {
  getReportCache,
  isReportCacheFresh,
  setReportCache,
} from "@/lib/report-cache";
import { PANORAMA_TAHSILAT_VIEW, supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import {
  tahsilatOdendiMi,
  tahsilatOdenmediMi,
} from "@/lib/sync/parse-tahsilat";

/** TahsilatRaporu (5230) — tazelik rozeti bu rapor id'sine bakar. */
export const TAHSILAT_REPORT_ID = 5230;

export const TAHSILAT_TREND_GUN_SAYISI = 60;

/**
 * PII (tc_kimlik_no, vergi_no) BİLEREK yok — landing'de durur, UI çekmez.
 */
const SELECT_KOLONLARI =
  "belgekod,musteri_kod,musteri_unvan,islem_tarihi,vade_tarihi,tutar," +
  "odeme_durum,tahsilat_tur,islem_tip,satis_temsilcisi,giris_tipi," +
  "cek_no,banka,belge_no,makbuz_no,tahsilat_tipi";

function sayi(value: unknown): number {
  return sayiyaCevir(value) ?? 0;
}

function metin(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function istanbulIsoGun(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function gunEkle(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export interface TahsilatSatiri {
  belgeKod: string;
  musteriKod: string;
  musteriUnvan: string | null;
  islemTarihi: string | null;
  vadeTarihi: string | null;
  tutar: number;
  odemeDurum: string | null;
  tahsilatTur: string | null;
  islemTip: string | null;
  satisTemsilcisi: string | null;
  girisTipi: string | null;
  cekNo: string | null;
  banka: string | null;
  belgeNo: string | null;
  makbuzNo: string | null;
  tahsilatTipi: string | null;
  odendi: boolean;
  odenmedi: boolean;
}

export interface TahsilatFilters {
  tur: string | null;
  temsilci: string | null;
  durum: string | null;
  arama: string;
}

export const EMPTY_TAHSILAT_FILTERS: TahsilatFilters = {
  tur: null,
  temsilci: null,
  durum: null,
  arama: "",
};

export function tahsilatFiltersActive(f: TahsilatFilters): boolean {
  return (
    f.tur != null ||
    f.temsilci != null ||
    f.durum != null ||
    f.arama.trim() !== ""
  );
}

export type TahsilatSortField =
  | "islemTarihi"
  | "musteriUnvan"
  | "tutar"
  | "vadeTarihi";
export interface TahsilatSort {
  field: TahsilatSortField;
  dir: "asc" | "desc";
}

export const VARSAYILAN_TAHSILAT_SORT: TahsilatSort = {
  field: "islemTarihi",
  dir: "desc",
};

export interface TahsilatOzet {
  donemTahsilat: number;
  son7Gun: number;
  odenmemisTutar: number;
  odenmemisAdet: number;
  belgeAdet: number;
  musteriAdet: number;
  kkPay: number;
  eftPay: number;
  nakitPay: number;
}

export interface TahsilatGunu {
  tarih: string;
  tutar: number;
}

export interface TahsilatDilimi {
  ad: string;
  tutar: number;
  adet: number;
  pay: number;
}

interface TahsilatRaporuState {
  tumSatirlar: TahsilatSatiri[];
  loading: boolean;
  error: string | null;
}

const CACHE_KEY = "tahsilat-raporu";

function hamSatir(row: Record<string, unknown>): TahsilatSatiri {
  const durum = metin(row.odeme_durum);
  return {
    belgeKod: metin(row.belgekod) ?? "",
    musteriKod: metin(row.musteri_kod) ?? "",
    musteriUnvan: metin(row.musteri_unvan),
    islemTarihi: parseIslemTarihi(row.islem_tarihi),
    vadeTarihi: parseIslemTarihi(row.vade_tarihi),
    tutar: sayi(row.tutar),
    odemeDurum: durum,
    tahsilatTur: metin(row.tahsilat_tur),
    islemTip: metin(row.islem_tip),
    satisTemsilcisi: metin(row.satis_temsilcisi),
    girisTipi: metin(row.giris_tipi),
    cekNo: metin(row.cek_no),
    banka: metin(row.banka),
    belgeNo: metin(row.belge_no),
    makbuzNo: metin(row.makbuz_no),
    tahsilatTipi: metin(row.tahsilat_tipi),
    odendi: tahsilatOdendiMi(durum),
    odenmedi: tahsilatOdenmediMi(durum),
  };
}

function turNorm(ad: string | null): string {
  return (ad ?? "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR");
}

function kkMi(tur: string | null): boolean {
  const t = turNorm(tur);
  return t.includes("kredi") || t.includes("kart");
}
function eftMi(tur: string | null): boolean {
  const t = turNorm(tur);
  return t.includes("havale") || t.includes("eft");
}
function nakitMi(tur: string | null): boolean {
  return turNorm(tur).includes("nakit");
}

function grupla(satirlar: TahsilatSatiri[], key: (s: TahsilatSatiri) => string | null): TahsilatDilimi[] {
  const map = new Map<string, { tutar: number; adet: number }>();
  let toplam = 0;
  for (const s of satirlar) {
    const ad = key(s)?.trim() || "—";
    const cur = map.get(ad) ?? { tutar: 0, adet: 0 };
    cur.tutar += s.tutar;
    cur.adet += 1;
    map.set(ad, cur);
    toplam += s.tutar;
  }
  return [...map.entries()]
    .map(([ad, v]) => ({
      ad,
      tutar: Math.round(v.tutar * 100) / 100,
      adet: v.adet,
      pay: toplam > 0 ? v.tutar / toplam : 0,
    }))
    .sort((a, b) => b.tutar - a.tutar);
}

export function useTahsilatRaporu(filters: TahsilatFilters, sort: TahsilatSort) {
  const cached = getReportCache<TahsilatSatiri[]>(CACHE_KEY);
  const [state, setState] = useState<TahsilatRaporuState>(() => ({
    tumSatirlar: cached ?? [],
    loading: !cached,
    error: null,
  }));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const hasCache = Boolean(getReportCache<TahsilatSatiri[]>(CACHE_KEY));
    if (hasCache && isReportCacheFresh(CACHE_KEY)) return;

    let cancelled = false;

    async function run() {
      if (hasCache) setRefreshing(true);
      try {
        const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
          supabase
            .from(PANORAMA_TAHSILAT_VIEW)
            .select(SELECT_KOLONLARI)
            .range(from, to) as unknown as Promise<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>
        );
        if (cancelled) return;
        const satirlar = rows.map(hamSatir).filter((s) => s.belgeKod || s.musteriKod);
        setReportCache(CACHE_KEY, satirlar);
        setState({ tumSatirlar: satirlar, loading: false, error: null });
        setRefreshing(false);
      } catch (err) {
        if (cancelled) return;
        setRefreshing(false);
        if (hasCache) return;
        setState({
          tumSatirlar: [],
          loading: false,
          error:
            err instanceof Error
              ? `Tahsilat verisi yüklenemedi: ${err.message}`
              : "Tahsilat verisi yüklenemedi.",
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const { tumSatirlar, loading, error } = state;

  const turSecenekleri = useMemo(() => {
    const set = new Set<string>();
    for (const s of tumSatirlar) {
      if (s.tahsilatTur) set.add(s.tahsilatTur);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [tumSatirlar]);

  const temsilciSecenekleri = useMemo(() => {
    const set = new Set<string>();
    for (const s of tumSatirlar) {
      if (s.satisTemsilcisi) set.add(s.satisTemsilcisi);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [tumSatirlar]);

  const durumSecenekleri = useMemo(() => {
    const set = new Set<string>();
    for (const s of tumSatirlar) {
      if (s.odemeDurum) set.add(s.odemeDurum);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [tumSatirlar]);

  const satirlar = useMemo(() => {
    const arama = filters.arama.trim().toLocaleLowerCase("tr");
    const filtreli = tumSatirlar.filter((s) => {
      if (filters.tur && s.tahsilatTur !== filters.tur) return false;
      if (filters.temsilci && s.satisTemsilcisi !== filters.temsilci) return false;
      if (filters.durum && s.odemeDurum !== filters.durum) return false;
      if (arama) {
        const havuz =
          `${s.musteriUnvan ?? ""} ${s.musteriKod} ${s.belgeKod}`.toLocaleLowerCase(
            "tr"
          );
        if (!havuz.includes(arama)) return false;
      }
      return true;
    });
    const yon = sort.dir === "asc" ? 1 : -1;
    return [...filtreli].sort((a, b) => {
      if (sort.field === "musteriUnvan") {
        return (
          (a.musteriUnvan ?? a.musteriKod).localeCompare(
            b.musteriUnvan ?? b.musteriKod,
            "tr"
          ) * yon
        );
      }
      if (sort.field === "islemTarihi" || sort.field === "vadeTarihi") {
        const av = a[sort.field] ?? "";
        const bv = b[sort.field] ?? "";
        if (av === bv) return a.belgeKod.localeCompare(b.belgeKod, "tr");
        return av.localeCompare(bv) * yon;
      }
      const fark = a.tutar - b.tutar;
      return fark !== 0 ? fark * yon : a.belgeKod.localeCompare(b.belgeKod, "tr");
    });
  }, [tumSatirlar, filters, sort]);

  const ozet = useMemo<TahsilatOzet>(() => {
    const bugun = istanbulIsoGun();
    const gun7 = gunEkle(bugun, -6);
    let donemTahsilat = 0;
    let son7Gun = 0;
    let odenmemisTutar = 0;
    let odenmemisAdet = 0;
    let kk = 0;
    let eft = 0;
    let nakit = 0;
    const musteriler = new Set<string>();
    for (const s of satirlar) {
      if (s.musteriKod) musteriler.add(s.musteriKod);
      if (s.odenmedi) {
        odenmemisTutar += s.tutar;
        odenmemisAdet += 1;
        continue;
      }
      if (!s.odendi) continue;
      donemTahsilat += s.tutar;
      if (s.islemTarihi && s.islemTarihi >= gun7) son7Gun += s.tutar;
      if (kkMi(s.tahsilatTur)) kk += s.tutar;
      else if (eftMi(s.tahsilatTur)) eft += s.tutar;
      else if (nakitMi(s.tahsilatTur)) nakit += s.tutar;
    }
    const payPayda = donemTahsilat > 0 ? donemTahsilat : 1;
    return {
      donemTahsilat: Math.round(donemTahsilat * 100) / 100,
      son7Gun: Math.round(son7Gun * 100) / 100,
      odenmemisTutar: Math.round(odenmemisTutar * 100) / 100,
      odenmemisAdet,
      belgeAdet: satirlar.length,
      musteriAdet: musteriler.size,
      kkPay: kk / payPayda,
      eftPay: eft / payPayda,
      nakitPay: nakit / payPayda,
    };
  }, [satirlar]);

  const gunluk = useMemo<TahsilatGunu[]>(() => {
    const bugun = istanbulIsoGun();
    const bas = gunEkle(bugun, -(TAHSILAT_TREND_GUN_SAYISI - 1));
    const map = new Map<string, number>();
    for (let i = 0; i < TAHSILAT_TREND_GUN_SAYISI; i++) {
      map.set(gunEkle(bas, i), 0);
    }
    for (const s of satirlar) {
      if (!s.odendi || !s.islemTarihi) continue;
      if (s.islemTarihi < bas) continue;
      map.set(s.islemTarihi, (map.get(s.islemTarihi) ?? 0) + s.tutar);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tarih, tutar]) => ({
        tarih,
        tutar: Math.round(tutar * 100) / 100,
      }));
  }, [satirlar]);

  const odendiSatirlar = useMemo(
    () => satirlar.filter((s) => s.odendi),
    [satirlar]
  );

  const turDagilimi = useMemo(
    () => grupla(odendiSatirlar, (s) => s.tahsilatTur),
    [odendiSatirlar]
  );
  const temsilciDagilimi = useMemo(
    () => grupla(odendiSatirlar, (s) => s.satisTemsilcisi),
    [odendiSatirlar]
  );

  const odenmediSatirlar = useMemo(
    () => satirlar.filter((s) => s.odenmedi),
    [satirlar]
  );

  return {
    satirlar,
    tumSatirlar,
    odenmediSatirlar,
    ozet,
    gunluk,
    turDagilimi,
    temsilciDagilimi,
    turSecenekleri,
    temsilciSecenekleri,
    durumSecenekleri,
    loading: loading || refreshing,
    error,
  };
}
