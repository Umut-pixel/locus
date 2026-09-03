"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  filoSec,
  type EhliyetSinifi,
  type FiloSecimi,
  type Sofor,
} from "@/lib/rota/atama";
import {
  rotaVerisiCek,
  ROTA_REPORT_ID,
  type RotaAraci,
  type RotaDuragi,
} from "@/lib/rota/veri";
import {
  getReportCache,
  isReportCacheFresh,
  setReportCache,
} from "@/lib/report-cache";
import { supabase } from "@/lib/supabase";

/*
 * Veri çekimi ve satır dönüşümleri lib/rota/veri.ts'e taşındı: aynı sorguları
 * /api/rota/otomatik de (service role ile) çalıştırıyor. Tipler burada yeniden
 * dışa verilir ki mevcut import'lar değişmesin.
 */
export { ROTA_REPORT_ID };
export type { RotaAraci, RotaDuragi };

/** Pencere değişince ayrı cache — 30 günlük veri "hepsi" sanılmasın. */
function cacheAnahtari(gunPenceresi: number | null): string {
  return `rota-plani-${gunPenceresi ?? "hepsi"}`;
}

/** Ekranın üst şeridi — plan kurulmadan önceki durum özeti. */
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
        const sonraki = await rotaVerisiCek(supabase, gunPenceresi);

        if (iptal) return;

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
