"use client";

import { useEffect, useMemo, useState } from "react";

import {
  BORC_ONEMLILIK_ESIGI,
  debtRiskDurumu,
  type RiskMetricMode,
} from "@/lib/risk-mode";
import {
  MUSTERILER_RAPOR_VIEW,
  MUSTERI_METRIK_GECMIS_TABLE,
  PANORAMA_SYNC_RUNS_TABLE,
  RAPOR_BOLGE_DISI_OZET_VIEW,
  supabase,
} from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import type { RiskDurumu } from "@/lib/types";

export const RAPORLAMA_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const TREND_GUN_SAYISI = 14;

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

/**
 * "Açık Bakiye" kolonunun HANGİ alanı gösterdiği filtreye bağlı.
 *
 * Bir gecikme bandı seçiliyken (ör. "70+ gün") kullanıcı o banda düşen borcu
 * görmek istiyor; toplam borcu göstermek yanıltıcıydı — filtre satırları
 * daraltıyor ama tutar tüm bantların toplamı olarak kalıyordu.
 * Bant seçili değilse davranış eskisi gibi: yas_toplam (tüm açık bakiye).
 */
export function acikBakiyeKolonu(filters: RaporlamaFilters): string {
  return filters.gecikmeBandi && BORC_GECIKME_KOLONLARI.has(filters.gecikmeBandi)
    ? filters.gecikmeBandi
    : "yas_toplam";
}

/** Satırda gösterilecek açık bakiye tutarı — bkz. acikBakiyeKolonu. */
export function acikBakiyeDegeri(
  row: MusteriRaporSatiri,
  filters: RaporlamaFilters
): number | null {
  const kolon = acikBakiyeKolonu(filters);
  const v = (row as unknown as Record<string, unknown>)[kolon];
  return typeof v === "number" ? v : null;
}

/** Aktif bandın etiketi (ör. "70+ gün") — kolon başlığında gösterilir. */
export function gecikmeBandiEtiketi(filters: RaporlamaFilters): string | null {
  if (!filters.gecikmeBandi) return null;
  return (
    BORC_GECIKME_BANTLARI.find((b) => b.value === filters.gecikmeBandi)?.label ??
    null
  );
}

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
  /**
   * Panorama'nin "Nettutar"i — KDV DAHIL tutar, yani musteriden tahsil edilen
   * para. `belge_net_ciro` (KDV haric) ciro konusurken, bu alan TAHSILAT
   * konusurken dogru olan. Ikisi ayni sey degil; bkz. melih-not-ciro-mutabakat.md.
   */
  belge_net_ciro_kdv_dahil: number | null;
  /** Iskonto oncesi brut satis tutari — bkz. sql/raporlama_view_koordinatsiz.sql. */
  belge_brut_ciro: number | null;
  belge_siparis_sayisi: number | null;
  belge_fatura_sayisi: number | null;
  belge_son_islem_tarihi: string | null;
  yas_toplam: number | null;
  yas_riskli_tutar: number | null;
  /** debtRiskDurumu'nun "riskli" (56+ gün) eşiğini belirlediği alan. */
  borc_riskli: boolean | null;
  son_teslimat_tarihi: string | null;
  toplam_teslimat_sayisi: number;
  /** Gün bandı kırılımı — Açık Bakiye kolonu bant filtresindeyken buradan okur. */
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
}

const ROW_SELECT =
  "musteri_kodu,unvan,sehir,ilce,musteri_grubu,durum,belge_st_adi,risk_durumu," +
  "belge_net_ciro,belge_net_ciro_kdv_dahil,belge_siparis_sayisi,belge_fatura_sayisi," +
  "belge_son_islem_tarihi," +
  "yas_toplam,yas_riskli_tutar,borc_riskli,son_teslimat_tarihi,toplam_teslimat_sayisi," +
  "hf_01_06,hf_07_13,hf_14_20,hf_21_27,hf_28_34,hf_35_41,hf_42_48," +
  "hf_49_55,hf_56_62,hf_63_69,hf_70_ustu";

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
/* eslint-disable @typescript-eslint/no-explicit-any */
function applyFilters(
  query: any,
  filters: RaporlamaFilters,
  riskMode: RiskMetricMode
): any {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let q = query;
  const term = filters.search.trim();
  if (term.length >= 2) {
    const pattern = `%${escapeIlike(term)}%`;
    q = q.or(`unvan.ilike."${pattern}",musteri_kodu.ilike."${pattern}"`);
  }
  if (riskMode === "borc") {
    // debtRiskDurumu'nun SQL karşılığı (bkz. lib/risk-mode.ts). Karar
    // saklanan borc_riskli bayrağından değil TUTARDAN veriliyor; bayrak
    // kuruşluk artıkları da "riskli" sayıp etiketi şişiriyordu.
    const E = BORC_ONEMLILIK_ESIGI;
    if (filters.risk === "hic_teslimat_yok") {
      q = q.is("yas_toplam", null);
    } else if (filters.risk === "riskli") {
      q = q.gte("yas_riskli_tutar", E);
    } else if (filters.risk === "izlenmeli") {
      q = q.gte("yas_toplam", E).lt("yas_riskli_tutar", E);
    } else if (filters.risk === "saglikli") {
      q = q.not("yas_toplam", "is", null).lt("yas_toplam", E);
    }
  } else if (filters.risk) {
    // Sevkiyat modu — view'daki hazır risk_durumu kolonu doğrudan kullanılır.
    q = q.eq("risk_durumu", filters.risk);
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
 * yanıtı sessizce 1000 satırda kesiyor (bu projede ölçüldü — bkz. lib/supabase-fetch-all.ts) —
 * bu yüzden aralık belirtmemek yerine dolana kadar 1000'lik turlarla çekiyoruz.
 */
async function fetchAllFiltered<T>(
  select: string,
  filters: RaporlamaFilters,
  riskMode: RiskMetricMode,
  options?: { signal?: AbortSignal; orderBy?: string }
): Promise<T[]> {
  return fetchAllRows<T>((from, to) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = applyFilters(
      supabase.from(MUSTERILER_RAPOR_VIEW).select(select),
      filters,
      riskMode
    );
    if (options?.orderBy) query = query.order(options.orderBy, { ascending: true });
    query = query.range(from, to);
    if (options?.signal) query = query.abortSignal(options.signal);
    return query;
  });
}

export interface RaporlamaSummary {
  toplamNetCiro: number;
  /** Ayni kumenin KDV DAHIL toplami — tahsilat tarafi (bkz. belge_net_ciro_kdv_dahil). */
  toplamNetCiroKdvDahil: number;
  /**
   * Filtreye uyan TÜM satırların açık bakiye toplamı (görünen sayfa değil).
   * Gecikme bandı seçiliyse yalnızca o bandın tutarı toplanır — tabloda
   * gösterilen kolonla aynı alan (bkz. acikBakiyeKolonu).
   */
  toplamAcikBakiye: number;
  riskDagilimi: Record<RiskDurumu, number>;
}

const EMPTY_SUMMARY: RaporlamaSummary = {
  toplamNetCiro: 0,
  toplamNetCiroKdvDahil: 0,
  toplamAcikBakiye: 0,
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
  sort: RaporlamaSort | null = null,
  riskMode: RiskMetricMode = "borc"
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
        supabase.from(MUSTERILER_RAPOR_VIEW).select(ROW_SELECT, { count: "exact" }),
        effectiveFilters,
        riskMode
      );
      // Kullanıcı bir kolon sıralaması seçtiyse onu uygula; yoksa varsayılan
      // (en gecikmiş teslimat en üstte) sıralamaya dön. `unvan` her zaman
      // eşit değerler arasında deterministik ikincil sıralamadır.
      // Açık Bakiye sıralaması ekranda gösterilen kolonu takip eder: bant
      // filtresi aktifken toplam yerine o bandın tutarına göre sıralanır.
      const sortKolon =
        sort?.alan === "acik_bakiye"
          ? acikBakiyeKolonu(effectiveFilters)
          : sort
            ? SORT_KOLON[sort.alan]
            : "";
      query = sort
        ? query.order(sortKolon, {
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
  }, [effectiveFilters, page, sort, riskMode]);

  useEffect(() => {
    const ac = new AbortController();
    setSummaryLoading(true);

    async function run() {
      try {
        const dagilim: Record<RiskDurumu, number> = {
          saglikli: 0,
          izlenmeli: 0,
          riskli: 0,
          hic_teslimat_yok: 0,
        };
        let toplam = 0;
        let toplamKdvDahil = 0;
        let bakiyeToplam = 0;

        // Açık bakiye toplamı ekrandaki kolonla aynı alandan gelsin: bant
        // seçiliyse o bandın tutarı, değilse tüm açık bakiye.
        const bakiyeKolon = acikBakiyeKolonu(effectiveFilters);

        if (riskMode === "borc") {
          // Set: bakiyeKolon zaten yas_toplam ise iki kez istenmesin.
          const select = [
            ...new Set([
              "belge_net_ciro",
              "belge_net_ciro_kdv_dahil",
              "yas_toplam",
              "yas_riskli_tutar",
              bakiyeKolon,
            ]),
          ].join(",");
          const data = await fetchAllFiltered<
            Record<string, number | null>
          >(select, effectiveFilters, riskMode, { signal: ac.signal });
          if (ac.signal.aborted) return;
          for (const row of data) {
            toplam += row.belge_net_ciro ?? 0;
            toplamKdvDahil += row.belge_net_ciro_kdv_dahil ?? 0;
            bakiyeToplam += row[bakiyeKolon] ?? 0;
            dagilim[debtRiskDurumu(row)] += 1;
          }
        } else {
          const select = [
            ...new Set([
              "belge_net_ciro",
              "belge_net_ciro_kdv_dahil",
              "risk_durumu",
              bakiyeKolon,
            ]),
          ].join(",");
          const data = await fetchAllFiltered<
            Record<string, number | RiskDurumu | null>
          >(select, effectiveFilters, riskMode, { signal: ac.signal });
          if (ac.signal.aborted) return;
          for (const row of data) {
            toplam += (row.belge_net_ciro as number | null) ?? 0;
            toplamKdvDahil +=
              (row.belge_net_ciro_kdv_dahil as number | null) ?? 0;
            bakiyeToplam += (row[bakiyeKolon] as number | null) ?? 0;
            dagilim[row.risk_durumu as RiskDurumu] += 1;
          }
        }

        setSummary({
          toplamNetCiro: toplam,
          toplamNetCiroKdvDahil: Math.round(toplamKdvDahil * 100) / 100,
          toplamAcikBakiye: Math.round(bakiyeToplam * 100) / 100,
          riskDagilimi: dagilim,
        });
      } catch {
        // abort ya da ağ hatası — özet sessizce önceki değerinde kalır
      } finally {
        if (!ac.signal.aborted) setSummaryLoading(false);
      }
    }

    void run();
    return () => ac.abort();
  }, [effectiveFilters, riskMode]);

  return { rows, totalCount, loading, error, summary, summaryLoading };
}

/** Dışa aktarma — geçerli filtrelerle eşleşen TÜM satırlar (sadece görünen sayfa değil). */
export async function fetchAllMusteriRaporu(
  filters: RaporlamaFilters,
  riskMode: RiskMetricMode
): Promise<MusteriRaporSatiri[]> {
  return fetchAllFiltered<MusteriRaporSatiri>(ROW_SELECT, filters, riskMode, {
    orderBy: "unvan",
  });
}

/** Tekil-kolon dropdown seçenekleri için sayfalı toplayıcı — aynı 1000 satır kesilme riski geçerli. */
async function fetchDistinctColumn(
  column: string,
  eqFilter?: { column: string; value: string }
): Promise<string[]> {
  const set = new Set<string>();

  const rows = await fetchAllRows<Record<string, string | null>>((from, to) => {
    let query = supabase
      .from(MUSTERILER_RAPOR_VIEW)
      .select(column)
      .not(column, "is", null)
      .range(from, to);
    if (eqFilter) query = query.eq(eqFilter.column, eqFilter.value);
    return query as unknown as PromiseLike<{
      data: Record<string, string | null>[] | null;
      error: { message: string } | null;
    }>;
  }).catch(() => []);

  for (const row of rows) {
    const value = row[column];
    if (value) set.add(value);
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
  belge_net_ciro_kdv_dahil: number | null;
  belge_son_islem_tarihi: string | null;
}

const DETAY_SELECT =
  "musteri_kodu,lat,lon,adres,geocode_hassasiyet,rut_kod,guncellendi," +
  "ilk_teslimat_tarihi,toplam_agirlik,toplam_tutar,son_teslimattan_gecen_gun," +
  "belge_top_urun,belge_son_urun,belge_vade_gunu,borc_riskli,yas_st,yas_inserted_at," +
  "hf_01_06,hf_07_13,hf_14_20,hf_21_27,hf_28_34,hf_35_41,hf_42_48," +
  "hf_49_55,hf_56_62,hf_63_69,hf_70_ustu,yas_toplam,yas_riskli_tutar," +
  "belge_net_ciro,belge_net_ciro_kdv_dahil,belge_son_islem_tarihi";

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
      .from(MUSTERILER_RAPOR_VIEW)
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

/** Tarayıcı UTC'sinden bağımsız İstanbul takvim günü (YYYY-MM-DD) — bkz. useNetCiroTrendi. */
function istanbulTarihi(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

export interface NetCiroTrendi {
  /** Bugünden önceki en son snapshot günü (musteri_metrik_gecmis) — yoksa null. */
  oncekiTarih: string | null;
  oncekiToplam: number | null;
  loading: boolean;
}

/**
 * Özet çubuğundaki toplam net ciro rakamının bir önceki güne göre yönünü
 * göstermek için: bugünden önceki en son musteri_metrik_gecmis snapshot'ının
 * TÜM müşteriler üzerindeki toplamı. `musteri_metrik_gecmis`'te segment/şehir/
 * temsilci gibi filtre kolonları yok — bu yüzden yalnızca filtre yokken
 * anlamlı; çağıran taraf `enabled`'ı buna göre kapatmalı (bkz.
 * MusteriRaporlamaSummary → raporlamaFiltersActive).
 */
export function useNetCiroTrendi(enabled: boolean): NetCiroTrendi {
  const [state, setState] = useState<{
    oncekiTarih: string | null;
    oncekiToplam: number | null;
    loading: boolean;
  }>({ oncekiTarih: null, oncekiToplam: null, loading: true });

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true }));

    async function run() {
      // snapshot_tarihi, current_date'i Postgres'in cron sırasındaki oturumundan
      // alıyor (pg_cron 08:15 TR'de çalışıyor) — bu yüzden "bugün" tarayıcının
      // toISOString()'ı (UTC) değil, İstanbul takvim günü olmalı. UTC kullanmak
      // gece yarısı ile 03:00 arası bir gün geriye kayıp yanlış satırı seçtiriyordu.
      const bugun = istanbulTarihi();
      const { data: oncekiSatir, error: tarihErr } = await supabase
        .from(MUSTERI_METRIK_GECMIS_TABLE)
        .select("snapshot_tarihi")
        .lt("snapshot_tarihi", bugun)
        .order("snapshot_tarihi", { ascending: false })
        .limit(1)
        .abortSignal(ac.signal)
        .maybeSingle();
      if (ac.signal.aborted) return;
      if (tarihErr || !oncekiSatir) {
        setState({ oncekiTarih: null, oncekiToplam: null, loading: false });
        return;
      }
      const oncekiTarih = (oncekiSatir as { snapshot_tarihi: string }).snapshot_tarihi;

      let toplam = 0;
      try {
        const rows = await fetchAllRows<{ net_ciro: number | null }>((from, to) =>
          supabase
            .from(MUSTERI_METRIK_GECMIS_TABLE)
            .select("net_ciro")
            .eq("snapshot_tarihi", oncekiTarih)
            .range(from, to)
            .abortSignal(ac.signal)
        );
        if (ac.signal.aborted) return;
        for (const row of rows) toplam += row.net_ciro ?? 0;
      } catch {
        if (!ac.signal.aborted) {
          setState({ oncekiTarih: null, oncekiToplam: null, loading: false });
        }
        return;
      }

      if (!ac.signal.aborted) setState({ oncekiTarih, oncekiToplam: toplam, loading: false });
    }

    void run();
    return () => ac.abort();
  }, [enabled]);

  return state;
}

export interface BolgeDisiOzet {
  musteriSayisi: number | null;
  netCiro: number | null;
  loading: boolean;
}

/**
 * 8-il filtresi dışında kalan ciro — mutabakat satırı.
 *
 * BelgeDetayRaporu (5450) bayi bölgesinin tamamını kapsıyor, müşteri master'ı
 * ise `SEHIR_HEDEF` ile 8 Ege iline daraltılıyor (bilinçli ürün kararı, bkz.
 * lib/import/cities.ts). Aradaki müşteriler hiçbir ekranda görünmüyordu ve
 * toplam Panorama'yla tutmuyordu. Bu hook farkı okunur kılar; kapsamı
 * değiştirmez.
 *
 * `useNetCiroTrendi` ile aynı kısıt: bu rakam TÜM veri üzerinden hesaplanır,
 * filtreye duyarlı değildir — çağıran taraf filtre varken kapatmalı.
 */
export function useBolgeDisiOzet(enabled: boolean): BolgeDisiOzet {
  const [state, setState] = useState<BolgeDisiOzet>({
    musteriSayisi: null,
    netCiro: null,
    loading: true,
  });

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    // Baslangic state'i zaten loading:true. Burada tekrar set etmiyoruz:
    // rakam filtreden bagimsiz sabit oldugu icin yeniden etkinlesildiginde
    // onceki (ayni) degeri gostermek dogru — ve effect icinde senkron setState
    // cascading render'a yol aciyor (react-hooks/set-state-in-effect).

    async function run() {
      const { data, error } = await supabase
        .from(RAPOR_BOLGE_DISI_OZET_VIEW)
        .select("musteri_sayisi,net_ciro")
        .abortSignal(ac.signal)
        .maybeSingle();
      if (ac.signal.aborted) return;
      if (error || !data) {
        setState({ musteriSayisi: null, netCiro: null, loading: false });
        return;
      }
      const row = data as { musteri_sayisi: number | null; net_ciro: number | null };
      setState({
        musteriSayisi: row.musteri_sayisi ?? 0,
        netCiro: row.net_ciro ?? 0,
        loading: false,
      });
    }

    void run();
    return () => ac.abort();
  }, [enabled]);

  return state;
}

/**
 * Panorama raporlarının GERÇEK veri yaşı.
 *
 * `musteri_yaslandirma.guncellendi` transform'un çalıştığı anı gösteriyor; ana
 * hat her sabah çalıştığı için veri bayat olsa bile "bugün" görünüyordu. Asıl
 * soru "Panorama'dan en son ne zaman çekildi" — o da panorama_sync_runs'ta.
 *
 * 5530 (ST Yaşlandırma) özellikle önemli: bu turda n8n'de cron'u yok, sadece
 * manuel tetikleniyor — ve Açık Bakiye / Borç riski tamamen buna dayanıyor.
 */
export const YASLANDIRMA_REPORT_ID = 5530;
export const BELGE_DETAY_REPORT_ID = 5450;

export interface RaporTazeligi {
  /** Panorama'dan en son başarılı çekim anı (ISO) — yoksa null. */
  cekildiAt: string | null;
  /** Şu ana kadar geçen saat; cekildiAt yoksa null. */
  saatOnce: number | null;
  loading: boolean;
}

export function useRaporTazeligi(reportId: number): RaporTazeligi {
  // Yaş, `Date.now()` render sırasında çağrılmasın diye effect içinde hesaplanıp
  // state'e yazılır (react-hooks/purity: impure fonksiyon render'da çağrılamaz).
  const [state, setState] = useState<{
    cekildiAt: string | null;
    saatOnce: number | null;
    loading: boolean;
  }>({ cekildiAt: null, saatOnce: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    supabase
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("cekildi_at")
      .eq("report_id", reportId)
      .eq("durum", "completed")
      .order("cekildi_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        const cekildiAt =
          !error && data
            ? (data as { cekildi_at: string | null }).cekildi_at
            : null;
        const t = cekildiAt ? new Date(cekildiAt).getTime() : NaN;
        const saatOnce = Number.isNaN(t)
          ? null
          : Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
        setState({ cekildiAt, saatOnce, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return state;
}
