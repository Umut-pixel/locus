"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  filoSec,
  type Arac,
  type Durak,
  type EhliyetSinifi,
  type FiloSecimi,
  type Sofor,
} from "@/lib/rota/atama";
import {
  getReportCache,
  isReportCacheFresh,
  setReportCache,
} from "@/lib/report-cache";
import {
  ARACLAR_TABLE,
  BEKLEYEN_YUK_RPC,
  SOFORLER_TABLE,
  supabase,
} from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import type { RiskDurumu } from "@/lib/types";

/** Bekleyen sipariş kanalı (Panorama 5450 / sync_runs 5451) — tazelik rozeti. */
export const ROTA_REPORT_ID = 5451;

/** Pencere değişince ayrı cache — 30 günlük veri "hepsi" sanılmasın. */
function cacheAnahtari(gunPenceresi: number | null): string {
  return `rota-plani-${gunPenceresi ?? "hepsi"}`;
}

interface BekleyenYukRaw {
  musteri_kodu: string;
  unvan: string;
  ilce: string | null;
  sehir: string | null;
  lat: number | null;
  lon: number | null;
  risk_durumu: string | null;
  siparis_sayisi: number | null;
  satir_sayisi: number | null;
  olcusuz_satir: number | null;
  kg: number | string | null;
  cuval_esdeger: number | string | null;
  brut_tutar: number | string | null;
  en_eski_siparis_tarihi: string | null;
  en_yeni_siparis_tarihi: string | null;
}

interface AracRaw {
  kod: string;
  ad: string;
  cuval_kapasite: number | null;
  palet_kapasite: number | null;
  max_kg: number | string | null;
  max_kg_teyitli: boolean | null;
  ehliyet_sinifi: string | null;
  takograf: boolean | null;
  sira: number | null;
  not_metni: string | null;
}

interface SoforRaw {
  kod: string;
  ad: string;
  ehliyet_sinifi: string | null;
  sira: number | null;
}

/**
 * Planlanabilir durak — atama motorunun `Durak`'ı + ekran alanları.
 *
 * Rut alanı YOK: Melih (2026-09-02) "o öylesine yapılmış bir rut, düzenlenecek,
 * şuan bu veriyi dikkate almayalım" dedi. Zaten ölçülmüştü — gün tutarlılığı
 * %10-36, ziyaret sırası TSP alt sınırının 4,5-37 katı.
 */
export interface RotaDuragi extends Durak {
  ilce: string | null;
  sehir: string | null;
  riskDurumu: RiskDurumu | null;
  siparisSayisi: number;
  brutTutar: number;
  /** En eski bekleyen siparişin yaşı (gün). Tarih okunamazsa null. */
  yasGun: number | null;
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
  /** O gün çıkabilecek araçların çuval kapasitesi (şoför sınırı uygulanmış). */
  filoCuvalKapasitesi: number;
  /** İstiap haddi girilmemiş araç sayısı — hepsi tahminse uyarı gösterilir. */
  teyitsizAracSayisi: number;
  /** Sınıf başına aktif şoför. */
  soforSayisi: Record<EhliyetSinifi, number>;
}

interface RotaPlaniCache {
  duraklar: RotaDuragi[];
  araclar: RotaAraci[];
  soforler: Sofor[];
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
    riskDurumu: riskeCevir(r.risk_durumu),
    siparisSayisi: r.siparis_sayisi ?? 0,
    brutTutar: sayi(r.brut_tutar),
    yasGun: yasaCevir(r.en_eski_siparis_tarihi),
  };
}

/** RPC ISO tarih döndürür (date). Bozuk/boş değer null'a düşer. */
function yasaCevir(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const gun = Math.floor((Date.now() - t) / 86_400_000);
  return gun >= 0 ? gun : 0;
}

/** Tanımsız/bozuk değer büyük araç sınıfına düşer — küçük araca yanlışlıkla
 *  B şoförü atanmasındansa araç plan dışı kalsın. */
function ehliyeteCevir(value: string | null): EhliyetSinifi {
  return value === "B" ? "B" : "C";
}

function araceCevir(r: AracRaw): RotaAraci {
  return {
    kod: r.kod,
    ad: r.ad,
    cuvalKapasite: r.cuval_kapasite ?? 0,
    maxKg: sayiVeyaNull(r.max_kg),
    maxKgTeyitli: r.max_kg_teyitli === true,
    ehliyetSinifi: ehliyeteCevir(r.ehliyet_sinifi),
    takograf: r.takograf === true,
    paletKapasite: r.palet_kapasite,
    notMetni: r.not_metni,
  };
}

function soforeCevir(r: SoforRaw): Sofor {
  return {
    kod: r.kod,
    ad: r.ad,
    ehliyetSinifi: ehliyeteCevir(r.ehliyet_sinifi),
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
export function useRotaPlani(gunPenceresi: number | null = null) {
  const anahtar = cacheAnahtari(gunPenceresi);
  const cached = getReportCache<RotaPlaniCache>(anahtar);
  const [state, setState] = useState<RotaPlaniState>(() => ({
    duraklar: cached?.duraklar ?? [],
    araclar: cached?.araclar ?? [],
    soforler: cached?.soforler ?? [],
    loading: !cached,
    error: null,
  }));
  const [tazelemeSayaci, setTazelemeSayaci] = useState(0);

  const tazele = useCallback(() => setTazelemeSayaci((n) => n + 1), []);

  useEffect(() => {
    const hasCache = Boolean(getReportCache<RotaPlaniCache>(anahtar));
    if (tazelemeSayaci === 0 && hasCache && isReportCacheFresh(anahtar)) return;

    let iptal = false;

    async function run() {
      try {
        const [yukRows, aracRows, soforRows] = await Promise.all([
          // Tarih penceresi SQL fonksiyonunda uygulanıyor — kg/çuval matematiği
          // view'daki gibi veritabanında kalsın, uygulamada tekrarlanmasın.
          fetchAllRows<BekleyenYukRaw>((from, to) =>
            supabase
              .rpc(BEKLEYEN_YUK_RPC, { p_gun: gunPenceresi })
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
                "kod,ad,cuval_kapasite,palet_kapasite,max_kg,max_kg_teyitli," +
                  "ehliyet_sinifi,takograf,sira,not_metni"
              )
              .eq("aktif", true)
              .order("sira", { ascending: true })
              .range(from, to) as unknown as Promise<{
              data: AracRaw[] | null;
              error: { message: string } | null;
            }>
          ),
          fetchAllRows<SoforRaw>((from, to) =>
            supabase
              .from(SOFORLER_TABLE)
              .select("kod,ad,ehliyet_sinifi,sira")
              .eq("aktif", true)
              .order("sira", { ascending: true })
              .range(from, to) as unknown as Promise<{
              data: SoforRaw[] | null;
              error: { message: string } | null;
            }>
          ),
        ]);

        if (iptal) return;

        const sonraki: RotaPlaniCache = {
          duraklar: yukRows.map(duragaCevir),
          araclar: aracRows.map(araceCevir),
          soforler: soforRows.map(soforeCevir),
        };
        setReportCache(anahtar, sonraki);
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
  }, [tazelemeSayaci, gunPenceresi, anahtar]);

  const { duraklar, araclar, soforler } = state;

  /**
   * O gün hangi araçların çıkabileceği. Filo 4 araç ama kadro 3 şoför ve
   * şoförler sınıflar arası geçmiyor — Kangoo ile Transit aynı gün çıkamaz.
   * Atama ve doluluk hesabı bu alt kümeyle yapılır.
   */
  const filo = useMemo<FiloSecimi<RotaAraci>>(
    () => filoSec(duraklar, araclar, soforler),
    [duraklar, araclar, soforler]
  );

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
      filoCuvalKapasitesi: filo.secilen.reduce(
        (t, a) => t + a.cuvalKapasite,
        0
      ),
      teyitsizAracSayisi: filo.secilen.filter((a) => !a.maxKgTeyitli).length,
      soforSayisi: filo.soforSayisi,
    };
  }, [duraklar, filo]);

  return {
    loading: state.loading,
    error: state.error,
    duraklar,
    /** Filonun tamamı — "şoför yok" nedenini ayırt etmek için gerekiyor. */
    araclar,
    soforler,
    filo,
    ozet,
    tazele,
  };
}
