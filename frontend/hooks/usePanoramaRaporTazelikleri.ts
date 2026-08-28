"use client";

import { useCallback, useEffect, useState } from "react";

import { PANORAMA_SYNC_RUNS_TABLE, supabase } from "@/lib/supabase";

const POLL_MS = 3 * 60 * 1000;
const SAAT_MS = 3_600_000;

export type AyarlarRaporSatiri = {
  id: number;
  ad: string;
  /** Ana zincir fingerprint'ine girmez (5430 / 5140). */
  bagimsiz: boolean;
};

export const AYARLAR_RAPORLARI: readonly AyarlarRaporSatiri[] = [
  { id: 5020, ad: "Müşteri listesi", bagimsiz: false },
  { id: 5500, ad: "Rota", bagimsiz: false },
  { id: 5130, ad: "Sevkiyat", bagimsiz: false },
  { id: 5450, ad: "Belge detay (fatura)", bagimsiz: false },
  { id: 5451, ad: "Belge detay (sipariş)", bagimsiz: true },
  { id: 5530, ad: "ST Yaşlandırma", bagimsiz: false },
  { id: 5430, ad: "Stok", bagimsiz: true },
  { id: 5140, ad: "Sipariş durum", bagimsiz: true },
  { id: 5230, ad: "Tahsilat", bagimsiz: true },
];

export type RaporTazelikSatiri = AyarlarRaporSatiri & {
  cekildiAt: string | null;
  saatOnce: number | null;
};

function saatOnceFrom(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / SAAT_MS));
}

export function usePanoramaRaporTazelikleri() {
  const [satirlar, setSatirlar] = useState<RaporTazelikSatiri[]>(() =>
    AYARLAR_RAPORLARI.map((r) => ({
      ...r,
      cekildiAt: null,
      saatOnce: null,
    }))
  );
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    try {
      const rows = await Promise.all(
        AYARLAR_RAPORLARI.map(async (rapor) => {
          const { data, error } = await supabase
            .from(PANORAMA_SYNC_RUNS_TABLE)
            .select("cekildi_at")
            .eq("report_id", rapor.id)
            .eq("durum", "completed")
            .order("cekildi_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;
          const cekildiAt =
            data && typeof data.cekildi_at === "string" ? data.cekildi_at : null;
          return {
            ...rapor,
            cekildiAt,
            saatOnce: saatOnceFrom(cekildiAt),
          };
        })
      );
      setSatirlar(rows);
    } catch (err) {
      console.warn("[usePanoramaRaporTazelikleri]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  return { satirlar, loading, refresh: poll };
}
