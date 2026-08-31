"use client";

import { useEffect, useMemo, useState } from "react";

import {
  BORC_GECIKME_BANTLARI,
  type MusteriRaporSatiri,
} from "@/hooks/useMusteriRaporlama";
import { KEEP_BELGE_TIP, parseIslemTarihi } from "@/lib/import/parse-belge-detay";
import { sayiyaCevir } from "@/lib/import/utils";
import {
  getReportCache,
  isReportCacheFresh,
  setReportCache,
} from "@/lib/report-cache";
import {
  MUSTERILER_RAPOR_VIEW,
  PANORAMA_ACIK_FATURA_VADE_KUP_VIEW,
  PANORAMA_BELGE_DETAY_VIEW,
  PANORAMA_SIPARIS_DETAY_VIEW,
  PANORAMA_TAHSILAT_VIEW,
  supabase,
} from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import {
  tahsilatOdenmediMi,
} from "@/lib/sync/parse-tahsilat";

const BELGE_TIPLERI = [...KEEP_BELGE_TIP];
/**
 * Belge Detay fatura (5450 / BD2) `bekleyen_siparis` boş. Sipariş kanalı
 * aynı raporun Edt_R4=1 çekimi (sync 5451). KPI = 5140 BrutTutar:
 * yalnız "Bekleyen Sipariş" × satış belge tipi, iskonto ve KDV hariç.
 */
const BEKLEYEN_SIPARIS_DURUMLARI = ["Bekleyen Sipariş"] as const;
/** Ciro trendi penceresi — açık uçlu bir tarih seçici yerine sabit, makul bir varsayılan. */
export const CIRO_TREND_GUN_SAYISI = 60;
const BELGE_DETAY_MAX_BATCHES = 15;

/** Yerel takvim günü (UTC `toISOString` TR gece yarısında bir gün kaydırır). */
function yerelIsoGun(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const gun = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${gun}`;
}

/** KPI kartı: içinde bulunulan takvim ayının 1'i (month-to-date). */
export function buAyinBasiIso(now = new Date()): string {
  return yerelIsoGun(new Date(now.getFullYear(), now.getMonth(), 1));
}

function sayi(value: unknown): number {
  return sayiyaCevir(value) ?? 0;
}

function metin(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** IslemTip içeriğinde "iade" geçiyorsa iade hareketi — Türkçe İ/I tuzağına düşmeden. */
function iadeMi(islemTip: string | null): boolean {
  if (!islemTip) return false;
  return islemTip
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .includes("iade");
}

// ---------------------------------------------------------------------------
// musteriler_rapor — şirket geneli borç/ciro KPI'ları + bant dağılımı + top borçlular
// ---------------------------------------------------------------------------

const MUSTERI_SELECT =
  "musteri_kodu,unvan,sehir,ilce,yas_toplam,yas_riskli_tutar,belge_net_ciro," +
  "belge_net_ciro_kdv_dahil,belge_brut_ciro,hf_01_06,hf_07_13,hf_14_20,hf_21_27,hf_28_34," +
  "hf_35_41,hf_42_48,hf_49_55,hf_56_62,hf_63_69,hf_70_ustu";

type MusteriFinansalRow = Pick<
  MusteriRaporSatiri,
  | "musteri_kodu"
  | "unvan"
  | "sehir"
  | "ilce"
  | "yas_toplam"
  | "yas_riskli_tutar"
  | "belge_net_ciro"
  | "belge_net_ciro_kdv_dahil"
  | "belge_brut_ciro"
  | "hf_01_06"
  | "hf_07_13"
  | "hf_14_20"
  | "hf_21_27"
  | "hf_28_34"
  | "hf_35_41"
  | "hf_42_48"
  | "hf_49_55"
  | "hf_56_62"
  | "hf_63_69"
  | "hf_70_ustu"
>;

export interface FinansalOzet {
  toplamAcikBakiye: number;
  /**
   * Henüz sevk/faturalaşmamış satış siparişlerinin brüt tutarı
   * (iskonto ve KDV hariç). 5140 BrutTutar = 5451 brut_tutar; Sevkiyat
   * paneli ile aynı küme. Alış, irsaliye/konsinye ve iptal dışarıda.
   */
  bekleyenSiparisNetTutar: number;
  bekleyenSiparisBelgeSayisi: number;
  /** İskonto öncesi brüt satış, KDV hariç — BelgeDetay BrutTutar. */
  toplamBrutCiro: number;
  toplamNetCiroKdvDahil: number;
  /** Ay başından bugüne Panorama BrutTutar (iskonto ve KDV hariç). */
  aylikNetCiro: number;
  /** Ay başından bugüne Panorama BrutTutar (iskonto öncesi). */
  donemTahsilat: number;
  odenmemisTahsilatTutar: number;
  odenmemisTahsilatAdet: number;
  borcluMusteriSayisi: number;
}

export interface BantDilimi {
  kolon: string;
  label: string;
  tutar: number;
}

export interface TopBorcluSatiri {
  musteriKodu: string;
  unvan: string;
  sehir: string | null;
  ilce: string | null;
  yasToplam: number;
  yasRiskliTutar: number;
}

// ---------------------------------------------------------------------------
// v_panorama_acik_fatura_vade_kup_guncel — satır bazlı açık fatura
// ---------------------------------------------------------------------------

interface AcikFaturaRaw {
  musteri_kod: string | null;
  musteri: string | null;
  belge_kod: string | null;
  gun: string | null;
  hafta: string | null;
  kalan_tutar: string | null;
  st: string | null;
}

export interface AcikFaturaSatiri {
  musteriKod: string;
  musteriAd: string | null;
  belgeKod: string;
  gun: number;
  hafta: string;
  kalanTutar: number;
  temsilci: string | null;
}

// ---------------------------------------------------------------------------
// v_panorama_belge_detay_raporu_guncel — satır bazlı ciro (trend + kırılım)
// ---------------------------------------------------------------------------

interface BelgeDetayRaw {
  islem_tarihi: string | null;
  nettutar: string | null;
  brut_tutar: string | null;
  iskonto: string | null;
  belge_tip: string | null;
  islem_tip: string | null;
  urun_grup: string | null;
  satis_temsilcisi: string | null;
}

interface BekleyenSiparisRaw {
  siparis_no: string | null;
  brut_tutar: string | null;
  belge_tip: string | null;
  iptal_neden: string | null;
}

export interface CiroGunu {
  tarih: string;
  netCiro: number;
}

export interface DagilimDilimi {
  ad: string;
  tutar: number;
  pay: number;
}

interface TahsilatRaw {
  tutar: string | null;
  odeme_durum: string | null;
}

interface FinansalRaporuState {
  musteriler: MusteriFinansalRow[];
  acikFaturalar: AcikFaturaSatiri[];
  belgeSatirlari: BelgeDetayRaw[];
  bekleyenSiparisSatirlari: BekleyenSiparisRaw[];
  tahsilatSatirlari: TahsilatRaw[];
  loading: boolean;
  error: string | null;
}

interface FinansalRaporuCache {
  musteriler: MusteriFinansalRow[];
  acikFaturalar: AcikFaturaSatiri[];
  belgeSatirlari: BelgeDetayRaw[];
  bekleyenSiparisSatirlari: BekleyenSiparisRaw[];
  tahsilatSatirlari: TahsilatRaw[];
}

const CACHE_KEY = "finansal-raporu-v9";

/**
 * Finansal Raporlar sayfası — tek seferde beş kaynağı çeker (Stok Raporları'nın
 * "single-fetch, client'ta türet" deseni), filtre/kırılım hesapları
 * bellekte yapılır. Kaynaklar:
 *  1. musteriler_rapor  — müşteri bazlı borç/ciro (şirket geneli KPI + bantlar)
 *  2. acik_fatura_vade_kup_guncel — satır bazlı açık fatura (drill-down tablo)
 *  3. belge_detay_raporu_guncel — satır bazlı ciro (trend + temsilci/ürün kırılımı)
 *  4. siparis_detay_raporu_guncel — bekleyen satış siparişi (5451 brut_tutar)
 *  5. tahsilat_raporu_guncel — ödenmemiş çek/senet (5230)
 *
 * Sayfalar arası geçişte boş ekran/yeniden fetch olmasın diye harita
 * sayfasıyla (bkz. musteri-cache.ts) aynı modül-seviyesi cache deseni: cache
 * varsa anında göster, taze değilse arka planda sessizce tazele.
 */
export function useFinansalRaporu() {
  const cached = getReportCache<FinansalRaporuCache>(CACHE_KEY);
  const [state, setState] = useState<FinansalRaporuState>(() => ({
    musteriler: cached?.musteriler ?? [],
    acikFaturalar: cached?.acikFaturalar ?? [],
    belgeSatirlari: cached?.belgeSatirlari ?? [],
    bekleyenSiparisSatirlari: cached?.bekleyenSiparisSatirlari ?? [],
    tahsilatSatirlari: cached?.tahsilatSatirlari ?? [],
    loading: !cached,
    error: null,
  }));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const hasCache = Boolean(getReportCache<FinansalRaporuCache>(CACHE_KEY));
    if (hasCache && isReportCacheFresh(CACHE_KEY)) return;

    let cancelled = false;

    async function run() {
      if (hasCache) setRefreshing(true);
      try {
        const [musteriRows, acikFaturaRows, belgeRows, bekleyenRows, tahsilatRows] =
          await Promise.all([
          fetchAllRows<MusteriFinansalRow>((from, to) =>
            supabase
              .from(MUSTERILER_RAPOR_VIEW)
              .select(MUSTERI_SELECT)
              .range(from, to) as unknown as Promise<{
              data: MusteriFinansalRow[] | null;
              error: { message: string } | null;
            }>
          ),
          fetchAllRows<AcikFaturaRaw>((from, to) =>
            supabase
              .from(PANORAMA_ACIK_FATURA_VADE_KUP_VIEW)
              .select("musteri_kod,musteri,belge_kod,gun,hafta,kalan_tutar,st")
              .neq("hafta", "Toplam")
              .range(from, to) as unknown as Promise<{
              data: AcikFaturaRaw[] | null;
              error: { message: string } | null;
            }>
          ),
          fetchAllRows<BelgeDetayRaw>(
            (from, to) =>
              supabase
                .from(PANORAMA_BELGE_DETAY_VIEW)
                .select(
                  "islem_tarihi,nettutar,brut_tutar,iskonto,belge_tip,islem_tip,urun_grup,satis_temsilcisi"
                )
                .in("belge_tip", BELGE_TIPLERI)
                .range(from, to) as unknown as Promise<{
                data: BelgeDetayRaw[] | null;
                error: { message: string } | null;
              }>,
            { maxBatches: BELGE_DETAY_MAX_BATCHES }
          ),
          fetchAllRows<BekleyenSiparisRaw>((from, to) =>
            supabase
              .from(PANORAMA_SIPARIS_DETAY_VIEW)
              .select("siparis_no,brut_tutar,belge_tip,iptal_neden")
              .in("bekleyen_siparis", [...BEKLEYEN_SIPARIS_DURUMLARI])
              .in("belge_tip", BELGE_TIPLERI)
              .is("iptal_neden", null)
              .range(from, to) as unknown as Promise<{
              data: BekleyenSiparisRaw[] | null;
              error: { message: string } | null;
            }>
          ),
          fetchAllRows<TahsilatRaw>((from, to) =>
            supabase
              .from(PANORAMA_TAHSILAT_VIEW)
              .select("tutar,odeme_durum")
              .range(from, to) as unknown as Promise<{
              data: TahsilatRaw[] | null;
              error: { message: string } | null;
            }>
          ),
        ]);

        if (cancelled) return;

        const acikFaturalar: AcikFaturaSatiri[] = acikFaturaRows
          .map((r) => ({
            musteriKod: metin(r.musteri_kod) ?? "",
            musteriAd: metin(r.musteri),
            belgeKod: metin(r.belge_kod) ?? "",
            gun: Math.round(sayi(r.gun)),
            hafta: metin(r.hafta) ?? "",
            kalanTutar: sayi(r.kalan_tutar),
            temsilci: metin(r.st),
          }))
          .filter((r) => r.musteriKod && r.kalanTutar > 0);

        const next: FinansalRaporuCache = {
          musteriler: musteriRows,
          acikFaturalar,
          belgeSatirlari: belgeRows,
          bekleyenSiparisSatirlari: bekleyenRows,
          tahsilatSatirlari: tahsilatRows,
        };
        setReportCache(CACHE_KEY, next);
        setState({ ...next, loading: false, error: null });
        setRefreshing(false);
      } catch (err) {
        if (cancelled) return;
        setRefreshing(false);
        if (hasCache) return; // taze olmayan cache bile boş ekrandan iyi
        setState({
          musteriler: [],
          acikFaturalar: [],
          belgeSatirlari: [],
          bekleyenSiparisSatirlari: [],
          tahsilatSatirlari: [],
          loading: false,
          error:
            err instanceof Error
              ? `Finansal veri yüklenemedi: ${err.message}`
              : "Finansal veri yüklenemedi.",
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    musteriler,
    acikFaturalar,
    belgeSatirlari,
    bekleyenSiparisSatirlari,
    tahsilatSatirlari,
    loading,
    error,
  } = state;

  const ozet = useMemo<FinansalOzet>(() => {
    let toplamAcikBakiye = 0;
    let toplamNetCiroKdvDahil = 0;
    let borcluMusteriSayisi = 0;
    for (const m of musteriler) {
      toplamAcikBakiye += m.yas_toplam ?? 0;
      toplamNetCiroKdvDahil += m.belge_net_ciro_kdv_dahil ?? 0;
      if ((m.yas_toplam ?? 0) > 0) borcluMusteriSayisi += 1;
    }

    // Kalem satırları sipariş bazında toplanır (5450 grain = kalem, id = siparis_no).
    // Tutar = BrutTutar (5140 ham Excel; iskonto ve KDV hariç).
    const belgeTutar = new Map<string, number>();
    for (const r of bekleyenSiparisSatirlari) {
      if (metin(r.iptal_neden)) continue;
      const tip = metin(r.belge_tip);
      if (!tip || !KEEP_BELGE_TIP.has(tip)) continue;
      const kod = metin(r.siparis_no);
      if (!kod) continue;
      belgeTutar.set(kod, (belgeTutar.get(kod) ?? 0) + sayi(r.brut_tutar));
    }
    let bekleyenSiparisNetTutar = 0;
    for (const t of belgeTutar.values()) bekleyenSiparisNetTutar += t;

    let donemTahsilat = 0;
    let odenmemisTahsilatTutar = 0;
    let odenmemisTahsilatAdet = 0;
    for (const r of tahsilatSatirlari) {
      const durum = metin(r.odeme_durum);
      const amount = sayi(r.tutar);
      if (tahsilatOdenmediMi(durum)) {
        odenmemisTahsilatTutar += amount;
        odenmemisTahsilatAdet += 1;
      }
    }

    return {
      toplamAcikBakiye: Math.round(toplamAcikBakiye * 100) / 100,
      bekleyenSiparisNetTutar: Math.round(bekleyenSiparisNetTutar * 100) / 100,
      bekleyenSiparisBelgeSayisi: belgeTutar.size,
      toplamBrutCiro: 0,
      toplamNetCiroKdvDahil: Math.round(toplamNetCiroKdvDahil * 100) / 100,
      aylikNetCiro: 0,
      donemTahsilat,
      odenmemisTahsilatTutar: Math.round(odenmemisTahsilatTutar * 100) / 100,
      odenmemisTahsilatAdet,
      borcluMusteriSayisi,
    };
  }, [musteriler, bekleyenSiparisSatirlari, tahsilatSatirlari]);

  const bantlar = useMemo<BantDilimi[]>(() => {
    return BORC_GECIKME_BANTLARI.map((bant) => {
      let tutar = 0;
      for (const m of musteriler) {
        const v = (m as unknown as Record<string, number | null>)[bant.value];
        tutar += v ?? 0;
      }
      return { kolon: bant.value, label: bant.label, tutar: Math.round(tutar * 100) / 100 };
    });
  }, [musteriler]);

  const topBorclular = useMemo<TopBorcluSatiri[]>(() => {
    return musteriler
      .filter((m) => (m.yas_toplam ?? 0) > 0)
      .map((m) => ({
        musteriKodu: m.musteri_kodu,
        unvan: m.unvan,
        sehir: m.sehir,
        ilce: m.ilce,
        yasToplam: m.yas_toplam ?? 0,
        yasRiskliTutar: m.yas_riskli_tutar ?? 0,
      }))
      .sort((a, b) => b.yasToplam - a.yasToplam)
      .slice(0, 20);
  }, [musteriler]);

  // Satış hareketleri: iade satırları ciroya negatifleriyle girer ama "aktivite"
  // kırılımlarına (temsilci/ürün/trend) girmez — parse-belge-detay.ts'teki
  // musteri_belge_ozet agregasyonuyla aynı kural.
  const { ciroGunluk, temsilciDagilimi, urunGrubuDagilimi, iadeToplam, satisToplam, aylikNetCiro, aylikBrutTutar, belgeBrutCiro } =
    useMemo(() => {
      const gunlukMap = new Map<string, number>();
      const temsilciMap = new Map<string, number>();
      const urunGrubuMap = new Map<string, number>();
      let iadeToplam = 0;
      let satisToplam = 0;
      let aylikNetCiro = 0;
      let aylikBrutTutar = 0;
      let belgeBrutCiro = 0;

      // Trend penceresi bugünden geriye sayılır (dosyadaki en yeni tarihten
      // değil) — sync durursa grafik boşalarak bunu gösterir, sessizce
      // "en son veri"ye kayıp bayatlığı gizlemez. Aynı ilke: sql/risk_durumu_current_date.sql.
      const trendBaslangic = new Date();
      trendBaslangic.setDate(trendBaslangic.getDate() - CIRO_TREND_GUN_SAYISI);
      const trendBaslangicIso = trendBaslangic.toISOString().slice(0, 10);

      const aylikBaslangicIso = buAyinBasiIso();

      for (const r of belgeSatirlari) {
        // KDV hariç gerçek net satış = brüt - iskonto (Panorama'nın "Nettutar"ı
        // KDV dahildir — trend/kırılım KDV hariç kalır, 1 aylık ciro BrutTutar).
        // bkz. sql/net_ciro_kdv_haric.sql
        const brut = sayi(r.brut_tutar);
        const iskonto = sayi(r.iskonto);
        const netHesap = Math.round((brut - iskonto) * 100) / 100;
        const iade = iadeMi(metin(r.islem_tip));
        const tarih = parseIslemTarihi(r.islem_tarihi);

        // Brüt ciro = BelgeDetay BrutTutar (iskonto ve KDV hariç). İade
        // satırları işaretleriyle girer (parse-belge-detay.ts).
        belgeBrutCiro += brut;
        if (tarih && tarih >= aylikBaslangicIso) {
          aylikNetCiro += brut;
          aylikBrutTutar += brut;
        }

        if (iade) {
          iadeToplam += Math.abs(netHesap);
          continue;
        }
        satisToplam += netHesap;

        if (tarih && tarih >= trendBaslangicIso) {
          gunlukMap.set(tarih, (gunlukMap.get(tarih) ?? 0) + netHesap);
        }
        const temsilci = metin(r.satis_temsilcisi);
        if (temsilci) {
          temsilciMap.set(temsilci, (temsilciMap.get(temsilci) ?? 0) + netHesap);
        }
        const urunGrup = metin(r.urun_grup);
        if (urunGrup) {
          urunGrubuMap.set(urunGrup, (urunGrubuMap.get(urunGrup) ?? 0) + netHesap);
        }
      }

      const ciroGunluk: CiroGunu[] = [...gunlukMap.entries()]
        .map(([tarih, netCiro]) => ({
          tarih,
          netCiro: Math.round(netCiro * 100) / 100,
        }))
        .sort((a, b) => a.tarih.localeCompare(b.tarih));

      const toplamHelper = (map: Map<string, number>): DagilimDilimi[] => {
        const toplam = [...map.values()].reduce((a, v) => a + v, 0);
        return [...map.entries()]
          .map(([ad, tutar]) => ({
            ad,
            tutar: Math.round(tutar * 100) / 100,
            pay: toplam > 0 ? tutar / toplam : 0,
          }))
          .sort((a, b) => b.tutar - a.tutar);
      };

      return {
        ciroGunluk,
        temsilciDagilimi: toplamHelper(temsilciMap),
        urunGrubuDagilimi: toplamHelper(urunGrubuMap),
        iadeToplam: Math.round(iadeToplam * 100) / 100,
        satisToplam: Math.round(satisToplam * 100) / 100,
        aylikNetCiro: Math.round(aylikNetCiro * 100) / 100,
        aylikBrutTutar: Math.round(aylikBrutTutar * 100) / 100,
        belgeBrutCiro: Math.round(belgeBrutCiro * 100) / 100,
      };
    }, [belgeSatirlari]);

  const iadeOrani = satisToplam > 0 ? iadeToplam / satisToplam : 0;

  const ozetKpi = useMemo<FinansalOzet>(
    () => ({
      ...ozet,
      toplamBrutCiro: belgeBrutCiro,
      aylikNetCiro,
      donemTahsilat: aylikBrutTutar,
    }),
    [ozet, belgeBrutCiro, aylikNetCiro, aylikBrutTutar]
  );

  return {
    loading,
    refreshing,
    error,
    ozet: ozetKpi,
    bantlar,
    topBorclular,
    acikFaturalar,
    ciroGunluk,
    temsilciDagilimi,
    urunGrubuDagilimi,
    iadeToplam,
    iadeOrani,
  };
}
