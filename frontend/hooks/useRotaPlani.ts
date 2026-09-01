"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Arac, Durak } from "@/lib/rota/atama";
import {
  getReportCache,
  isReportCacheFresh,
  setReportCache,
} from "@/lib/report-cache";
import {
  ARACLAR_TABLE,
  MUSTERI_BEKLEYEN_YUK_VIEW,
  supabase,
} from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import type { RiskDurumu } from "@/lib/types";

/** Bekleyen sipariş kanalı (Panorama 5450 / sync_runs 5451) — tazelik rozeti. */
export const ROTA_REPORT_ID = 5451;

const CACHE_KEY = "rota-plani";

interface BekleyenYukRaw {
  musteri_kodu: string;
  unvan: string;
  ilce: string | null;
  sehir: string | null;
  lat: number | null;
  lon: number | null;
  rut_kod: string | null;
  rut_aciklama: string | null;
  risk_durumu: string | null;
  siparis_sayisi: number | null;
  satir_sayisi: number | null;
  olcusuz_satir: number | null;
  kg: number | string | null;
  cuval_esdeger: number | string | null;
  brut_tutar: number | string | null;
}

interface AracRaw {
  kod: string;
  ad: string;
  cuval_kapasite: number | null;
  palet_kapasite: number | null;
  max_kg: number | string | null;
  max_kg_teyitli: boolean | null;
  sira: number | null;
  not_metni: string | null;
}

/** Planlanabilir durak — atama motorunun `Durak`'ı + ekran alanları. */
export interface RotaDuragi extends Durak {
  ilce: string | null;
  sehir: string | null;
  rutAciklama: string | null;
  riskDurumu: RiskDurumu | null;
  siparisSayisi: number;
  brutTutar: number;
}

/** Filo satırı — motorun `Arac`'ı + ekran alanları. */
export interface RotaAraci extends Arac {
  paletKapasite: number | null;
  notMetni: string | null;
}

export interface RotaOzeti {
  durakSayisi: number;
  koordinatsizSayisi: number;
  olcusuzIcerenSayisi: number;
  toplamKg: number;
  toplamCuval: number;
  toplamTutar: number;
  /** Filonun tamamının çuval kapasitesi — havuz sığıyor mu bakmak için. */
  filoCuvalKapasitesi: number;
  /** İstiap haddi girilmemiş araç sayısı — hepsi tahminse uyarı gösterilir. */
  teyitsizAracSayisi: number;
}

interface RotaPlaniCache {
  duraklar: RotaDuragi[];
  araclar: RotaAraci[];
}

function sayi(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sayiVeyaNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const RISK_DEGERLERI: ReadonlySet<string> = new Set<RiskDurumu>([
  "saglikli",
  "izlenmeli",
  "riskli",
  "hic_teslimat_yok",
]);

function riskeCevir(value: string | null): RiskDurumu | null {
  return value != null && RISK_DEGERLERI.has(value)
    ? (value as RiskDurumu)
    : null;
}

function duragaCevir(r: BekleyenYukRaw): RotaDuragi {
  return {
    musteriKodu: r.musteri_kodu,
    unvan: r.unvan,
    lat: r.lat,
    lon: r.lon,
    kg: sayi(r.kg),
    cuvalEsdeger: sayi(r.cuval_esdeger),
    olcusuzSatir: r.olcusuz_satir ?? 0,
    ilce: r.ilce,
    sehir: r.sehir,
    rutAciklama: r.rut_aciklama,
    riskDurumu: riskeCevir(r.risk_durumu),
    siparisSayisi: r.siparis_sayisi ?? 0,
    brutTutar: sayi(r.brut_tutar),
  };
}

function araceCevir(r: AracRaw): RotaAraci {
  return {
    kod: r.kod,
    ad: r.ad,
    cuvalKapasite: r.cuval_kapasite ?? 0,
    maxKg: sayiVeyaNull(r.max_kg),
    maxKgTeyitli: r.max_kg_teyitli === true,
    paletKapasite: r.palet_kapasite,
    notMetni: r.not_metni,
  };
}

interface RotaPlaniState extends RotaPlaniCache {
  loading: boolean;
  error: string | null;
}

/**
 * Rota planlayıcısının verisi: bekleyen sipariş yükü + aktif filo.
 *
 * kg / çuval eşdeğeri hesabı `v_musteri_bekleyen_yuk` view'ında yapılır —
 * burada yalnızca okunur, yeniden hesaplanmaz.
 *
 * Cache/refresh deseni useSevkiyatRaporu.ts ile aynı: state cache'ten lazy
 * kurulur, effect içinde senkron setState yapılmaz.
 */
export function useRotaPlani() {
  const cached = getReportCache<RotaPlaniCache>(CACHE_KEY);
  const [state, setState] = useState<RotaPlaniState>(() => ({
    duraklar: cached?.duraklar ?? [],
    araclar: cached?.araclar ?? [],
    loading: !cached,
    error: null,
  }));
  const [tazelemeSayaci, setTazelemeSayaci] = useState(0);

  const tazele = useCallback(() => setTazelemeSayaci((n) => n + 1), []);

  useEffect(() => {
    const hasCache = Boolean(getReportCache<RotaPlaniCache>(CACHE_KEY));
    if (tazelemeSayaci === 0 && hasCache && isReportCacheFresh(CACHE_KEY)) return;

    let iptal = false;

    async function run() {
      try {
        const [yukRows, aracRows] = await Promise.all([
          fetchAllRows<BekleyenYukRaw>((from, to) =>
            supabase
              .from(MUSTERI_BEKLEYEN_YUK_VIEW)
              .select(
                "musteri_kodu,unvan,ilce,sehir,lat,lon,rut_kod,rut_aciklama,risk_durumu," +
                  "siparis_sayisi,satir_sayisi,olcusuz_satir,kg,cuval_esdeger,brut_tutar"
              )
              .order("kg", { ascending: false })
              .range(from, to) as unknown as Promise<{
              data: BekleyenYukRaw[] | null;
              error: { message: string } | null;
            }>
          ),
          fetchAllRows<AracRaw>((from, to) =>
            supabase
              .from(ARACLAR_TABLE)
              .select(
                "kod,ad,cuval_kapasite,palet_kapasite,max_kg,max_kg_teyitli,sira,not_metni"
              )
              .eq("aktif", true)
              .order("sira", { ascending: true })
              .range(from, to) as unknown as Promise<{
              data: AracRaw[] | null;
              error: { message: string } | null;
            }>
          ),
        ]);

        if (iptal) return;

        const sonraki: RotaPlaniCache = {
          duraklar: yukRows.map(duragaCevir),
          araclar: aracRows.map(araceCevir),
        };
        setReportCache(CACHE_KEY, sonraki);
        setState({ ...sonraki, loading: false, error: null });
      } catch (err) {
        if (iptal) return;
        setState((o) => ({
          ...o,
          loading: false,
          error:
            err instanceof Error ? err.message : "Rota verisi yüklenemedi.",
        }));
      }
    }

    void run();

    return () => {
      iptal = true;
    };
  }, [tazelemeSayaci]);

  const { duraklar, araclar } = state;

  const ozet = useMemo<RotaOzeti>(() => {
    let toplamKg = 0;
    let toplamCuval = 0;
    let toplamTutar = 0;
    let koordinatsiz = 0;
    let olcusuzIceren = 0;

    for (const d of duraklar) {
      toplamKg += d.kg;
      toplamCuval += d.cuvalEsdeger;
      toplamTutar += d.brutTutar;
      if (d.lat == null || d.lon == null) koordinatsiz++;
      if (d.olcusuzSatir > 0) olcusuzIceren++;
    }

    return {
      durakSayisi: duraklar.length,
      koordinatsizSayisi: koordinatsiz,
      olcusuzIcerenSayisi: olcusuzIceren,
      toplamKg,
      toplamCuval,
      toplamTutar,
      filoCuvalKapasitesi: araclar.reduce((t, a) => t + a.cuvalKapasite, 0),
      teyitsizAracSayisi: araclar.filter((a) => !a.maxKgTeyitli).length,
    };
  }, [duraklar, araclar]);

  return {
    loading: state.loading,
    error: state.error,
    duraklar,
    araclar,
    ozet,
    tazele,
  };
}
