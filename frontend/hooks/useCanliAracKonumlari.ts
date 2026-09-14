"use client";

/**
 * Canlı araç konumlarını okur ve güncel tutar.
 *
 * İki kanal birlikte çalışıyor:
 *
 *   1. Supabase Realtime — `arac_konum_son` tablosundaki her yazımda sinyal
 *      gelir, view yeniden çekilir. Realtime view yayınlayamaz (yalnız tablo),
 *      bu yüzden abonelik tabloya; veri view'dan.
 *   2. Yedek yoklama (90 sn) — websocket sessizce düşerse harita donmasın.
 *      n8n dakikada bir yazdığı için bu aralık "en kötü ihtimalle 90 sn geç"
 *      demek; bayatlık eşiği 10 dk olduğundan rozet yanlış yeşil kalmaz.
 *
 * Realtime bu projede İLK kez burada kullanılıyor. Çalışmazsa (publication
 * kapalı, RLS engeli, proxy websocket'i kesiyor) hook sessizce yedek yoklamaya
 * düşer — harita çalışmaya devam eder, yalnız gecikme artar. Bu yüzden
 * `realtimeDurumu` dışarı veriliyor: sorun teşhis edilebilsin.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  canliKonumCek,
  type CanliAracKonumu,
} from "@/lib/rota/canli-konum";
import { supabase, ARAC_KONUM_TABLE } from "@/lib/supabase";

/** Websocket düşerse haritanın donmaması için yedek yoklama aralığı. */
const YEDEK_YOKLAMA_MS = 90_000;

/**
 * Realtime sinyalleri kümelenerek gelir (n8n 8 aracı tek batch'te yazıyor →
 * 8 ayrı UPDATE olayı). Hepsi için ayrı sorgu atmamak adına kısa gecikme.
 */
const SINYAL_BEKLEME_MS = 400;

export type RealtimeDurumu = "baglaniyor" | "bagli" | "kapali";

export interface CanliKonumSonucu {
  konumlar: CanliAracKonumu[];
  yukleniyor: boolean;
  hata: string | null;
  /** Son BAŞARILI çekimin zamanı (ms). Hiç çekilemediyse null. */
  sonCekim: number | null;
  realtimeDurumu: RealtimeDurumu;
  yenile: () => void;
}

export function useCanliAracKonumlari(): CanliKonumSonucu {
  const [konumlar, setKonumlar] = useState<CanliAracKonumu[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [sonCekim, setSonCekim] = useState<number | null>(null);
  const [realtimeDurumu, setRealtimeDurumu] =
    useState<RealtimeDurumu>("baglaniyor");

  // Unmount sonrası setState uyarısını ve yarış durumunu önler.
  const canliRef = useRef(true);
  const sinyalZamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cek = useCallback(async () => {
    try {
      const veri = await canliKonumCek(supabase);
      if (!canliRef.current) return;
      setKonumlar(veri);
      setSonCekim(Date.now());
      setHata(null);
    } catch (err) {
      if (!canliRef.current) return;
      // Eldeki konumlar SİLİNMİYOR: bir çekim hatası yüzünden haritadaki
      // araçlar kaybolmasın. Bayatlık rozeti zaten yaşı gösteriyor.
      setHata(err instanceof Error ? err.message : String(err));
      console.error("[useCanliAracKonumlari] çekim", err);
    } finally {
      if (canliRef.current) setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    canliRef.current = true;
    void cek();

    const sinyal = () => {
      if (sinyalZamanlayiciRef.current) return; // zaten bekliyor
      sinyalZamanlayiciRef.current = setTimeout(() => {
        sinyalZamanlayiciRef.current = null;
        void cek();
      }, SINYAL_BEKLEME_MS);
    };

    const kanal = supabase
      .channel("arac-konum-canli")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: ARAC_KONUM_TABLE },
        sinyal
      )
      .subscribe((durum) => {
        if (!canliRef.current) return;
        if (durum === "SUBSCRIBED") setRealtimeDurumu("bagli");
        else if (durum === "CHANNEL_ERROR" || durum === "TIMED_OUT" || durum === "CLOSED") {
          setRealtimeDurumu("kapali");
        }
      });

    const yoklama = setInterval(() => void cek(), YEDEK_YOKLAMA_MS);

    return () => {
      canliRef.current = false;
      if (sinyalZamanlayiciRef.current) clearTimeout(sinyalZamanlayiciRef.current);
      clearInterval(yoklama);
      void supabase.removeChannel(kanal);
    };
  }, [cek]);

  return {
    konumlar,
    yukleniyor,
    hata,
    sonCekim,
    realtimeDurumu,
    yenile: () => void cek(),
  };
}
