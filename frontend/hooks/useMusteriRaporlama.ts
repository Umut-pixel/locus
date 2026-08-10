"use client";

import { useEffect, useMemo, useState } from "react";

import { debtRiskDurumu } from "@/lib/risk-mode";
import {
  MUSTERILER_HARITA_VIEW,
  MUSTERI_METRIK_GECMIS_TABLE,
  supabase,
} from "@/lib/supabase";
import type { RiskDurumu } from "@/lib/types";

export const RAPORLAMA_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const TREND_GUN_SAYISI = 14;
/** PostgREST varsayılan olarak .range()/.limit() verilmezse yanıtı sessizce 1000 satırda keser. */
const FETCH_ALL_BATCH_SIZE = 1000;
const FETCH_ALL_MAX_BATCHES = 5;

/** musteri_yaslandirma gün bandı kolonları — Excel'deki "01 - 06" … "70 Üstü" başlıklarının DB karşılığı. */
export const BORC_GECIKME_BANTLARI: { value: string; label: string }[] = [
  { value: "hf_01_06", label: "1–6 gün" },
  { value: "hf_07_13", label: "7–13 gün" },
  { value: "hf_14_20", label: "14–20 gün" },
  { value: "hf_21_27", label: "21–27 gün" },
  { value: "hf_28_34", label: "28–34 gün" },
  { value: "hf_35_41", label: "35–41 gün" },
  { value: "hf_42_48", label: "42–48 gün" },
  { value: "hf_49_55", label: "49–55 gün" },
  { value: "hf_56_62", label: "56–62 gün" },
  { value: "hf_63_69", label: "63–69 gün" },
  { value: "hf_70_ustu", label: "70+ gün" },
];
const BORC_GECIKME_KOLONLARI = new Set(BORC_GECIKME_BANTLARI.map((b) => b.value));

export interface RaporlamaFilters {
  search: string;
  risk: RiskDurumu | null;
  segment: string | null;
  temsilci: string | null;
  sehir: string | null;
  ilce: string | null;
  /** BORC_GECIKME_BANTLARI'ndan bir kolon adı (örn. "hf_70_ustu") ya da null. */
  gecikmeBandi: string | null;
}

export const EMPTY_RAPORLAMA_FILTERS: RaporlamaFilters = {
  search: "",
  risk: null,
  segment: null,
  temsilci: null,
  sehir: null,
  ilce: null,
  gecikmeBandi: null,
};

export function raporlamaFiltersActive(filters: RaporlamaFilters): boolean {
  return Boolean(
    filters.search.trim() ||
      filters.risk ||
      filters.segment ||
      filters.temsilci ||
      filters.sehir ||
      filters.ilce ||
      filters.gecikmeBandi
  );
}

export type RaporlamaSortAlan = "ciro" | "acik_bakiye";

export interface RaporlamaSort {
  alan: RaporlamaSortAlan;
  yon: "asc" | "desc";
}

const SORT_KOLON: Record<RaporlamaSortAlan, string> = {
  ciro: "belge_net_ciro",
  acik_bakiye: "yas_toplam",
};

/** `musteriler_harita`'dan rapor tablosunun ihtiyaç duyduğu dar kolon seti. */
export interface MusteriRaporSatiri {
  musteri_kodu: string;
  unvan: string;
  sehir: string | null;
  ilce: string | null;
  musteri_grubu: string | null;
  durum: string | null;
  /** BelgeDetayRaporu (5450) satış temsilcisi adı — view'da "temsilci" alanı yok, en yakın gerçek karşılık. */
  belge_st_adi: string | null;
  /** Sevkiyat (teslimat gecikmesi) bazlı — raporlamada risk GÖSTERİMİ için kullanılmaz, bkz. debtRiskDurumu. */
  risk_durumu: RiskDurumu;
  belge_net_ciro: number | null;
  belge_siparis_sayisi: number | null;
  belge_fatura_sayisi: number | null;
  belge_son_islem_tarihi: string | null;
  yas_toplam: number | null;
  yas_riskli_tutar: number | null;
  /** debtRiskDurumu'nun "riskli" (56+ gün) eşiğini belirlediği alan. */
  borc_riskli: boolean | null;
  son_teslimat_tarihi: string | null;
  toplam_teslimat_sayisi: number;
}

const ROW_SELECT =
  "musteri_kodu,unvan,sehir,ilce,musteri_grubu,durum,belge_st_adi,risk_durumu," +
  "belge_net_ciro,belge_siparis_sayisi,belge_fatura_sayisi,belge_son_islem_tarihi," +
  "yas_toplam,yas_riskli_tutar,borc_riskli,son_teslimat_tarihi,toplam_teslimat_sayisi";

function escapeIlike(q: string): string {
  return q
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, '""');
}

/**
 * Aynı filtre mantığını satır/özet/export sorgularının üçünde de kullan.
 * Supabase'in PostgrestFilterBuilder generic'i çok derin — üç farklı .select()
 * projeksiyonu üzerinden genel bir T constraint'iyle çağrılınca TS "excessively
 * deep" hatası veriyor. Sınırı burada, tek yerde kesiyoruz; sonuç yine de her
 * çağrı noktasında bilinen satır tipine cast ediliyor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: RaporlamaFilters): any {
  let q = query;
  const term = filters.search.trim();
  if (term.length >= 2) {
    const pattern = `%${escapeIlike(term)}%`;
    q = q.or(`unvan.ilike."${pattern}",musteri_kodu.ilike."${pattern}"`);
  }
  // Risk filtresi borç yaşlandırmasına göre — debtRiskDurumu'nun SQL karşılığı
  // (bkz. lib/risk-mode.ts). risk_durumu kolonu sevkiyat bazlı, burada kullanılmaz.
  if (filters.risk === "hic_teslimat_yok") {
    q = q.is("yas_toplam", null);
  } else if (filters.risk === "riskli") {
    q = q.eq("borc_riskli", true);
  } else if (filters.risk === "izlenmeli") {
    q = q.not("yas_toplam", "is", null).gt("yas_toplam", 0.005).eq("borc_riskli", false);
  } else if (filters.risk === "saglikli") {
    q = q.not("yas_toplam", "is", null).lte("yas_toplam", 0.005);
  }
  if (filters.segment) q = q.eq("musteri_grubu", filters.segment);
  if (filters.temsilci) q = q.eq("belge_st_adi", filters.temsilci);
  if (filters.sehir) q = q.eq("sehir", filters.sehir);
  if (filters.ilce) q = q.eq("ilce", filters.ilce);
  // Sabit BORC_GECIKME_BANTLARI enum'undan geldiği için kolon adı güvenli.
  if (filters.gecikmeBandi && BORC_GECIKME_KOLONLARI.has(filters.gecikmeBandi)) {
    q = q.gt(filters.gecikmeBandi, 0);
  }
  return q;
}

/**
 * Filtreye uyan TÜM satırları (sayfalanmadan) toplar. PostgREST .range() verilmezse
 * yanıtı sessizce 1000 satırda kesiyor (bu projede ölçüldü — bkz. FETCH_ALL_BATCH_SIZE) —
 * bu yüzden aralık belirtmemek yerine dolana kadar 1000'lik turlarla çekiyoruz.
 */
async function fetchAllFiltered<T>(
  select: string,
  filters: RaporlamaFilters,
  options?: { signal?: AbortSignal; orderBy?: string }
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;

  for (let i = 0; i < FETCH_ALL_MAX_BATCHES; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = applyFilters(supabase.from(MUSTERILER_HARITA_VIEW).select(select), filters);
    if (options?.orderBy) query = query.order(options.orderBy, { ascending: true });
    query = query.range(from, from + FETCH_ALL_BATCH_SIZE - 1);
    if (options?.signal) query = query.abortSignal(options.signal);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    results.push(...batch);
    if (batch.length < FETCH_ALL_BATCH_SIZE) break;
    from += FETCH_ALL_BATCH_SIZE;
  }

  return results;
}

export interface RaporlamaSummary {
  toplamNetCiro: number;
  riskDagilimi: Record<RiskDurumu, number>;
}

const EMPTY_SUMMARY: RaporlamaSummary = {
  toplamNetCiro: 0,
  riskDagilimi: { saglikli: 0, izlenmeli: 0, riskli: 0, hic_teslimat_yok: 0 },
};

interface UseMusteriRaporlamaResult {
  rows: MusteriRaporSatiri[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  summary: RaporlamaSummary;
  summaryLoading: boolean;
}

/**
 * Sunucu taraflı filtreli + sayfalı sorgu — 1200 satırın tamamını çekip
 * client'ta filtrelemek yerine her filtre/sayfa değişikliğinde Postgres'e gider.
 * Özet (toplam ciro, risk dağılımı) filtrelenmiş TÜM küme üzerinden ayrı, dar
 * projeksiyonlu bir sorguyla hesaplanır (sadece 2 kolon, sayfalanmaz).
 */
export function useMusteriRaporlama(
  filters: RaporlamaFilters,
  page: number,
  sort: RaporlamaSort | null = null
): UseMusteriRaporlamaResult {
  const [rows, setRows] = useState<MusteriRaporSatiri[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RaporlamaSummary>(EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedSearch(filters.search),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(t);
  }, [filters.search]);

  const effectiveFilters = useMemo(
    (): RaporlamaFilters => ({ ...filters, search: debouncedSearch }),
    // filters yalnızca primitive alanlar içeriyor — referans değil değer bazlı izle
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      debouncedSearch,
      filters.risk,
      filters.segment,
      filters.temsilci,
      filters.sehir,
      filters.ilce,
      filters.gecikmeBandi,
    ]
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    async function run() {
      const from = page * RAPORLAMA_PAGE_SIZE;
      const to = from + RAPORLAMA_PAGE_SIZE - 1;
      let query = applyFilters(
        supabase.from(MUSTERILER_HARITA_VIEW).select(ROW_SELECT, { count: "exact" }),
        effectiveFilters
      );
      // Kullanıcı bir kolon sıralaması seçtiyse onu uygula; yoksa varsayılan
      // (en gecikmiş teslimat en üstte) sıralamaya dön. `unvan` her zaman
      // eşit değerler arasında deterministik ikincil sıralamadır.
      query = sort
        ? query.order(SORT_KOLON[sort.alan], {
            ascending: sort.yon === "asc",
            nullsFirst: false,
          })
        : query.order("son_teslimattan_gecen_gun", {
            ascending: false,
            nullsFirst: false,
          });
      const { data, error: err, count } = await query
        .order("unvan", { ascending: true })
        .range(from, to)
        .abortSignal(ac.signal);

      if (ac.signal.aborted) return;
      if (err) {
        setError(err.message);
        setRows([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as unknown as MusteriRaporSatiri[]);
      setTotalCount(count ?? 0);
      setLoading(false);
    }

    void run();
    return () => ac.abort();
  }, [effectiveFilters, page, sort]);

  useEffect(() => {
    const ac = new AbortController();
    setSummaryLoading(true);

    async function run() {
      try {
        // risk_durumu (sevkiyat) değil — borç yaşlandırmasına göre dağılım.
        const data = await fetchAllFiltered<{
          belge_net_ciro: number | null;
          yas_toplam: number | null;
          borc_riskli: boolean | null;
        }>("belge_net_ciro,yas_toplam,borc_riskli", effectiveFilters, {
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;

        const dagilim: Record<RiskDurumu, number> = {
          saglikli: 0,
          izlenmeli: 0,
          riskli: 0,
          hic_teslimat_yok: 0,
        };
        let toplam = 0;
        for (const row of data) {
          toplam += row.belge_net_ciro ?? 0;
          dagilim[debtRiskDurumu(row)] += 1;
        }
        setSummary({ toplamNetCiro: toplam, riskDagilimi: dagilim });
      } catch {
        // abort ya da ağ hatası — özet sessizce önceki değerinde kalır
      } finally {
        if (!ac.signal.aborted) setSummaryLoading(false);
      }
    }

    void run();
    return () => ac.abort();
  }, [effectiveFilters]);

  return { rows, totalCount, loading, error, summary, summaryLoading };
}

/** Dışa aktarma — geçerli filtrelerle eşleşen TÜM satırlar (sadece görünen sayfa değil). */
export async function fetchAllMusteriRaporu(
  filters: RaporlamaFilters
): Promise<MusteriRaporSatiri[]> {
  return fetchAllFiltered<MusteriRaporSatiri>(ROW_SELECT, filters, { orderBy: "unvan" });
}

/** Tekil-kolon dropdown seçenekleri için sayfalı toplayıcı — aynı 1000 satır kesilme riski geçerli. */
async function fetchDistinctColumn(
  column: string,
  eqFilter?: { column: string; value: string }
): Promise<string[]> {
  const set = new Set<string>();
  let from = 0;

  for (let i = 0; i < FETCH_ALL_MAX_BATCHES; i++) {
    let query = supabase
      .from(MUSTERILER_HARITA_VIEW)
      .select(column)
      .not(column, "is", null)
      .range(from, from + FETCH_ALL_BATCH_SIZE - 1);
    if (eqFilter) query = query.eq(eqFilter.column, eqFilter.value);

    const { data, error } = await query;
    if (error) break;
    const batch = (data ?? []) as unknown as Record<string, string | null>[];
    for (const row of batch) {
      const value = row[column];
      if (value) set.add(value);
    }
    if (batch.length < FETCH_ALL_BATCH_SIZE) break;
    from += FETCH_ALL_BATCH_SIZE;
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
}

/** Segment dropdown'u dinamik sorgu değil — bkz. lib/raporlama-style.ts SEGMENT_OPTIONS (bilinen 7 ERP kodu). */
export function useTemsilciSecenekleri(): { options: string[]; loading: boolean } {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDistinctColumn("belge_st_adi")
      .then((opts) => {
        if (!cancelled) setOptions(opts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, loading };
}

/** Seçili şehre göre daralan ilçe listesi (cascading). */
export function useIlceSecenekleri(sehir: string | null): {
  options: string[];
  loading: boolean;
} {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDistinctColumn("ilce", sehir ? { column: "sehir", value: sehir } : undefined)
      .then((opts) => {
        if (!cancelled) setOptions(opts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sehir]);

  return { options, loading };
}

/**
 * Satır detay paneli için genişletilmiş veri — isteğe bağlı yüklenir.
 * Alan seti bilinçli olarak haritadaki CustomerDetailPanel'in Özet/Borçlar
 * sayfalarıyla aynı kolon havuzundan geliyor — rapor tablosundaki satır
 * detayı, haritadaki müşteri kartıyla aynı "kaynak gerçeği"ni gösterir.
 */
export interface MusteriDetay {
  musteri_kodu: string;
  lat: number | null;
  lon: number | null;
  adres: string | null;
  geocode_hassasiyet: import("@/lib/types").GeocodeHassasiyet | null;
  rut_kod: string | null;
  guncellendi: string | null;
  ilk_teslimat_tarihi: string | null;
  toplam_agirlik: number | null;
  toplam_tutar: number | null;
  son_teslimattan_gecen_gun: number | null;
  belge_top_urun: string | null;
  belge_son_urun: string | null;
  belge_vade_gunu: number | null;
  borc_riskli: boolean | null;
  yas_st: string | null;
  yas_inserted_at: string | null;
  hf_01_06: number | null;
  hf_07_13: number | null;
  hf_14_20: number | null;
  hf_21_27: number | null;
  hf_28_34: number | null;
  hf_35_41: number | null;
  hf_42_48: number | null;
  hf_49_55: number | null;
  hf_56_62: number | null;
  hf_63_69: number | null;
  hf_70_ustu: number | null;
  yas_toplam: number | null;
  yas_riskli_tutar: number | null;
  belge_net_ciro: number | null;
  belge_son_islem_tarihi: string | null;
}

const DETAY_SELECT =
  "musteri_kodu,lat,lon,adres,geocode_hassasiyet,rut_kod,guncellendi," +
  "ilk_teslimat_tarihi,toplam_agirlik,toplam_tutar,son_teslimattan_gecen_gun," +
  "belge_top_urun,belge_son_urun,belge_vade_gunu,borc_riskli,yas_st,yas_inserted_at," +
  "hf_01_06,hf_07_13,hf_14_20,hf_21_27,hf_28_34,hf_35_41,hf_42_48," +
  "hf_49_55,hf_56_62,hf_63_69,hf_70_ustu,yas_toplam,yas_riskli_tutar," +
  "belge_net_ciro,belge_son_islem_tarihi";

/** Satıra tıklanınca tek müşteri için ek detay çeker. */
export function useMusteriDetay(musteriKodu: string | null): {
  detay: MusteriDetay | null;
  loading: boolean;
} {
  const [detay, setDetay] = useState<MusteriDetay | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!musteriKodu) {
      setDetay(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    supabase
      .from(MUSTERILER_HARITA_VIEW)
      .select(DETAY_SELECT)
      .eq("musteri_kodu", musteriKodu)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setDetay(data as unknown as MusteriDetay);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [musteriKodu]);

  return { detay, loading };
}

export interface TrendNoktasi {
  tarih: string;
  net_ciro: number;
}

/** Sadece görünen sayfanın musteri_kodu'ları için — tüm 1200 müşteri için çekmez. */
export function useMusteriTrend(musteriKodlari: readonly string[]): {
  trendMap: Map<string, TrendNoktasi[]>;
  loading: boolean;
} {
  const key = musteriKodlari.join(",");
  const [trendMap, setTrendMap] = useState<Map<string, TrendNoktasi[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) {
      setTrendMap(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TREND_GUN_SAYISI);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    async function run() {
      const { data, error } = await supabase
        .from(MUSTERI_METRIK_GECMIS_TABLE)
        .select("musteri_kodu,snapshot_tarihi,net_ciro")
        .in("musteri_kodu", key.split(","))
        .gte("snapshot_tarihi", cutoffStr)
        .order("snapshot_tarihi", { ascending: true });
      if (cancelled) return;
      if (!error && data) {
        const map = new Map<string, TrendNoktasi[]>();
        for (const row of data as unknown as {
          musteri_kodu: string;
          snapshot_tarihi: string;
          net_ciro: number;
        }[]) {
          const list = map.get(row.musteri_kodu) ?? [];
          list.push({ tarih: row.snapshot_tarihi, net_ciro: row.net_ciro });
          map.set(row.musteri_kodu, list);
        }
        setTrendMap(map);
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { trendMap, loading };
}
