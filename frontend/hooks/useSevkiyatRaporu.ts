"use client";

import { useEffect, useMemo, useState } from "react";

import { parseBelgeTarihi } from "@/lib/import/parse-sevkiyat";
import { sayiyaCevir } from "@/lib/import/utils";
import {
  MUSTERILER_RAPOR_VIEW,
  MUSTERI_METRIK_GECMIS_TABLE,
  PANORAMA_SEVKIYAT_VIEW,
  supabase,
} from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import type { RiskDurumu } from "@/lib/types";

/** Şirket geneli günlük sevkiyat sıklığı trendi — pencere. */
export const SEVKIYAT_TREND_GUN_SAYISI = 30;
/** SevkiyatRaporuKup — tazelik rozeti bu rapor id'sine bakar (bkz. useMusteriRaporlama.ts→useRaporTazeligi). */
export const SEVKIYAT_REPORT_ID = 5130;

function sayi(value: unknown): number {
  return sayiyaCevir(value) ?? 0;
}

function metin(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// ---------------------------------------------------------------------------
// musteriler_rapor — rut/teslimat alanları, müşteri bazlı
// ---------------------------------------------------------------------------

interface MusteriSevkiyatRaw {
  musteri_kodu: string;
  unvan: string;
  sehir: string | null;
  ilce: string | null;
  rut_kod: string | null;
  rut_aciklama: string | null;
  son_teslimat_tarihi: string | null;
  ilk_teslimat_tarihi: string | null;
  toplam_teslimat_sayisi: number | null;
  toplam_agirlik: number | null;
  toplam_tutar: number | null;
  son_teslimattan_gecen_gun: number | null;
  risk_durumu: RiskDurumu;
}

const MUSTERI_SELECT =
  "musteri_kodu,unvan,sehir,ilce,rut_kod,rut_aciklama,son_teslimat_tarihi," +
  "ilk_teslimat_tarihi,toplam_teslimat_sayisi,toplam_agirlik,toplam_tutar," +
  "son_teslimattan_gecen_gun,risk_durumu";

export interface SevkiyatOzet {
  riskDagilimi: Record<RiskDurumu, number>;
  aktifRutSayisi: number;
  ortalamaGecikmeGun: number | null;
  musteriSayisi: number;
}

export interface RutSatiri {
  rutKod: string;
  rutAciklama: string | null;
  musteriSayisi: number;
  toplamAgirlik: number;
  toplamTutar: number;
  ortalamaGecikmeGun: number | null;
  riskliMusteriSayisi: number;
}

export interface RiskliMusteriSatiri {
  musteriKodu: string;
  unvan: string;
  sehir: string | null;
  ilce: string | null;
  rutKod: string | null;
  sonTeslimatTarihi: string | null;
  gecenGun: number | null;
  riskDurumu: RiskDurumu;
}

// ---------------------------------------------------------------------------
// musteri_metrik_gecmis — şirket geneli günlük sevkiyat sıklığı
// ---------------------------------------------------------------------------

export interface SiklikGunu {
  tarih: string;
  teslimatSayisi: number;
}

// ---------------------------------------------------------------------------
// v_panorama_sevkiyat_raporu_kup_guncel — satır bazlı, mevcut sync penceresi
// ---------------------------------------------------------------------------

interface SevkiyatSatirRaw {
  musteri_kodu: string | null;
  belge_tarihi: string | null;
  net_fiyat: string | null;
  agirlik: string | null;
  plaka: string | null;
  odeme_tip: string | null;
}

export interface PlakaDilimi {
  plaka: string;
  teslimatSayisi: number;
  toplamAgirlik: number;
  toplamTutar: number;
}

export interface OdemeTipiDilimi {
  ad: string;
  tutar: number;
  pay: number;
}

interface SevkiyatRaporuState {
  musteriler: MusteriSevkiyatRaw[];
  metrikGecmis: { snapshot_tarihi: string; toplam_teslimat_sayisi: number | null }[];
  sevkiyatSatirlari: SevkiyatSatirRaw[];
  loading: boolean;
  error: string | null;
}

/**
 * Sevkiyat Raporları sayfası — üç kaynak, tek seferde çekilir (Stok
 * Raporları'nın deseni). Kaynaklar:
 *  1. musteriler_rapor — rut bazlı performans + teslimat gecikmesi (anlık durum)
 *  2. musteri_metrik_gecmis — şirket geneli günlük sevkiyat sıklığı (gerçek trend,
 *     upload'ta yeniden hesaplanan toplam_teslimat_sayisi'nin aksine biriken snapshot)
 *  3. v_panorama_sevkiyat_raporu_kup_guncel — plaka/araç bazlı hacim (yalnızca
 *     mevcut sync penceresi — çoklu-sync trend için değil, bkz. #2)
 */
export function useSevkiyatRaporu() {
  const [state, setState] = useState<SevkiyatRaporuState>({
    musteriler: [],
    metrikGecmis: [],
    sevkiyatSatirlari: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - SEVKIYAT_TREND_GUN_SAYISI);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const [musteriRows, metrikRows, sevkiyatRows] = await Promise.all([
          fetchAllRows<MusteriSevkiyatRaw>((from, to) =>
            supabase
              .from(MUSTERILER_RAPOR_VIEW)
              .select(MUSTERI_SELECT)
              .range(from, to) as unknown as Promise<{
              data: MusteriSevkiyatRaw[] | null;
              error: { message: string } | null;
            }>
          ),
          fetchAllRows<{
            snapshot_tarihi: string;
            toplam_teslimat_sayisi: number | null;
          }>((from, to) =>
            supabase
              .from(MUSTERI_METRIK_GECMIS_TABLE)
              .select("snapshot_tarihi,toplam_teslimat_sayisi")
              .gte("snapshot_tarihi", cutoffStr)
              .range(from, to) as unknown as Promise<{
              data: { snapshot_tarihi: string; toplam_teslimat_sayisi: number | null }[] | null;
              error: { message: string } | null;
            }>
          ),
          fetchAllRows<SevkiyatSatirRaw>((from, to) =>
            supabase
              .from(PANORAMA_SEVKIYAT_VIEW)
              .select("musteri_kodu,belge_tarihi,net_fiyat,agirlik,plaka,odeme_tip")
              .range(from, to) as unknown as Promise<{
              data: SevkiyatSatirRaw[] | null;
              error: { message: string } | null;
            }>
          ).catch(() => []),
        ]);

        if (cancelled) return;
        setState({
          musteriler: musteriRows,
          metrikGecmis: metrikRows,
          sevkiyatSatirlari: sevkiyatRows,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          musteriler: [],
          metrikGecmis: [],
          sevkiyatSatirlari: [],
          loading: false,
          error:
            err instanceof Error
              ? `Sevkiyat verisi yüklenemedi: ${err.message}`
              : "Sevkiyat verisi yüklenemedi.",
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const { musteriler, metrikGecmis, sevkiyatSatirlari, loading, error } = state;

  const ozet = useMemo<SevkiyatOzet>(() => {
    const dagilim: Record<RiskDurumu, number> = {
      saglikli: 0,
      izlenmeli: 0,
      riskli: 0,
      hic_teslimat_yok: 0,
    };
    const rutlar = new Set<string>();
    let gecikmeToplam = 0;
    let gecikmeSayisi = 0;

    for (const m of musteriler) {
      dagilim[m.risk_durumu] += 1;
      if (m.rut_kod) rutlar.add(m.rut_kod);
      if (m.son_teslimattan_gecen_gun != null) {
        gecikmeToplam += m.son_teslimattan_gecen_gun;
        gecikmeSayisi += 1;
      }
    }

    return {
      riskDagilimi: dagilim,
      aktifRutSayisi: rutlar.size,
      ortalamaGecikmeGun: gecikmeSayisi > 0 ? Math.round(gecikmeToplam / gecikmeSayisi) : null,
      musteriSayisi: musteriler.length,
    };
  }, [musteriler]);

  const rutlar = useMemo<RutSatiri[]>(() => {
    const map = new Map<
      string,
      {
        rutAciklama: string | null;
        musteriSayisi: number;
        toplamAgirlik: number;
        toplamTutar: number;
        gecikmeToplam: number;
        gecikmeSayisi: number;
        riskliMusteriSayisi: number;
      }
    >();

    for (const m of musteriler) {
      const rutKod = m.rut_kod;
      if (!rutKod) continue;
      const acc = map.get(rutKod) ?? {
        rutAciklama: m.rut_aciklama,
        musteriSayisi: 0,
        toplamAgirlik: 0,
        toplamTutar: 0,
        gecikmeToplam: 0,
        gecikmeSayisi: 0,
        riskliMusteriSayisi: 0,
      };
      acc.musteriSayisi += 1;
      acc.toplamAgirlik += m.toplam_agirlik ?? 0;
      acc.toplamTutar += m.toplam_tutar ?? 0;
      if (m.son_teslimattan_gecen_gun != null) {
        acc.gecikmeToplam += m.son_teslimattan_gecen_gun;
        acc.gecikmeSayisi += 1;
      }
      if (m.risk_durumu === "riskli") acc.riskliMusteriSayisi += 1;
      map.set(rutKod, acc);
    }

    return [...map.entries()]
      .map(([rutKod, v]) => ({
        rutKod,
        rutAciklama: v.rutAciklama,
        musteriSayisi: v.musteriSayisi,
        toplamAgirlik: Math.round(v.toplamAgirlik * 100) / 100,
        toplamTutar: Math.round(v.toplamTutar * 100) / 100,
        ortalamaGecikmeGun:
          v.gecikmeSayisi > 0 ? Math.round(v.gecikmeToplam / v.gecikmeSayisi) : null,
        riskliMusteriSayisi: v.riskliMusteriSayisi,
      }))
      .sort((a, b) => b.toplamTutar - a.toplamTutar);
  }, [musteriler]);

  const enRiskliMusteriler = useMemo<RiskliMusteriSatiri[]>(() => {
    return musteriler
      .filter((m) => m.risk_durumu === "riskli")
      .map((m) => ({
        musteriKodu: m.musteri_kodu,
        unvan: m.unvan,
        sehir: m.sehir,
        ilce: m.ilce,
        rutKod: m.rut_kod,
        sonTeslimatTarihi: m.son_teslimat_tarihi,
        gecenGun: m.son_teslimattan_gecen_gun,
        riskDurumu: m.risk_durumu,
      }))
      .sort((a, b) => (b.gecenGun ?? 0) - (a.gecenGun ?? 0))
      .slice(0, 20);
  }, [musteriler]);

  const sikligiTrendi = useMemo<SiklikGunu[]>(() => {
    const map = new Map<string, number>();
    for (const r of metrikGecmis) {
      map.set(
        r.snapshot_tarihi,
        (map.get(r.snapshot_tarihi) ?? 0) + (r.toplam_teslimat_sayisi ?? 0)
      );
    }
    return [...map.entries()]
      .map(([tarih, teslimatSayisi]) => ({ tarih, teslimatSayisi }))
      .sort((a, b) => a.tarih.localeCompare(b.tarih));
  }, [metrikGecmis]);

  const { plakalar, odemeTipleri, sonSyncTarihi } = useMemo(() => {
    const plakaMap = new Map<
      string,
      { teslimatSayisi: number; toplamAgirlik: number; toplamTutar: number }
    >();
    const odemeMap = new Map<string, number>();
    let sonTarih: string | null = null;

    for (const r of sevkiyatSatirlari) {
      const plaka = metin(r.plaka);
      const tutar = sayi(r.net_fiyat);
      const agirlikKg = sayi(r.agirlik) / 1000;
      if (plaka) {
        const acc = plakaMap.get(plaka) ?? {
          teslimatSayisi: 0,
          toplamAgirlik: 0,
          toplamTutar: 0,
        };
        acc.teslimatSayisi += 1;
        acc.toplamAgirlik += agirlikKg;
        acc.toplamTutar += tutar;
        plakaMap.set(plaka, acc);
      }
      const odemeTip = metin(r.odeme_tip);
      if (odemeTip) {
        odemeMap.set(odemeTip, (odemeMap.get(odemeTip) ?? 0) + tutar);
      }
      const tarih = parseBelgeTarihi(r.belge_tarihi);
      const tarihStr = tarih ? tarih.toISOString().slice(0, 10) : null;
      if (tarihStr && (!sonTarih || tarihStr > sonTarih)) sonTarih = tarihStr;
    }

    const plakalar: PlakaDilimi[] = [...plakaMap.entries()]
      .map(([plaka, v]) => ({
        plaka,
        teslimatSayisi: v.teslimatSayisi,
        toplamAgirlik: Math.round(v.toplamAgirlik * 100) / 100,
        toplamTutar: Math.round(v.toplamTutar * 100) / 100,
      }))
      .sort((a, b) => b.toplamTutar - a.toplamTutar);

    const odemeToplam = [...odemeMap.values()].reduce((a, v) => a + v, 0);
    const odemeTipleri: OdemeTipiDilimi[] = [...odemeMap.entries()]
      .map(([ad, tutar]) => ({
        ad,
        tutar: Math.round(tutar * 100) / 100,
        pay: odemeToplam > 0 ? tutar / odemeToplam : 0,
      }))
      .sort((a, b) => b.tutar - a.tutar);

    return { plakalar, odemeTipleri, sonSyncTarihi: sonTarih };
  }, [sevkiyatSatirlari]);

  return {
    loading,
    error,
    ozet,
    rutlar,
    enRiskliMusteriler,
    sikligiTrendi,
    plakalar,
    odemeTipleri,
    sonSyncTarihi,
  };
}
