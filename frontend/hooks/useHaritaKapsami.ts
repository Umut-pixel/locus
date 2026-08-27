"use client";

import { useCallback, useEffect, useState } from "react";

import {
  MUSTERILER_HARITA_VIEW,
  MUSTERILER_RAPOR_VIEW,
  supabase,
} from "@/lib/supabase";
import type { GeocodeHassasiyet } from "@/lib/types";

const POLL_MS = 3 * 60 * 1000;
const CACHE_TTL_MS = 60_000;

export type HaritaKapsami = {
  konumlanan: number;
  toplam: number;
  hassasiyet: Record<GeocodeHassasiyet, number>;
};

const EMPTY: HaritaKapsami = {
  konumlanan: 0,
  toplam: 0,
  hassasiyet: {
    saha_gps: 0,
    mahalle_merkezi: 0,
    ilce_merkezi: 0,
  },
};

const HASSASIYET_KEYS: GeocodeHassasiyet[] = [
  "saha_gps",
  "mahalle_merkezi",
  "ilce_merkezi",
];

let cached: { at: number; data: HaritaKapsami } | null = null;
let inflight: Promise<HaritaKapsami> | null = null;

async function countExact(
  table: typeof MUSTERILER_RAPOR_VIEW | typeof MUSTERILER_HARITA_VIEW,
  hassasiyet?: GeocodeHassasiyet
): Promise<number> {
  const q = supabase.from(table).select("musteri_kodu", {
    count: "exact",
    head: true,
  });
  const { count, error } = await (hassasiyet
    ? q.eq("geocode_hassasiyet", hassasiyet)
    : q);
  if (error) throw error;
  return count ?? 0;
}

async function fetchKapsami(): Promise<HaritaKapsami> {
  const [toplam, konumlanan, ...hassasiyetCounts] = await Promise.all([
    countExact(MUSTERILER_RAPOR_VIEW),
    countExact(MUSTERILER_HARITA_VIEW),
    ...HASSASIYET_KEYS.map((k) => countExact(MUSTERILER_HARITA_VIEW, k)),
  ]);

  const hassasiyet = { ...EMPTY.hassasiyet };
  HASSASIYET_KEYS.forEach((k, i) => {
    hassasiyet[k] = hassasiyetCounts[i] ?? 0;
  });

  return { toplam, konumlanan, hassasiyet };
}

function loadKapsami(force: boolean): Promise<HaritaKapsami> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  if (inflight) return inflight;
  inflight = fetchKapsami()
    .then((data) => {
      cached = { at: Date.now(), data };
      inflight = null;
      return data;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

export function useHaritaKapsami() {
  const [data, setData] = useState<HaritaKapsami | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async (force = false) => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden" &&
      !force
    ) {
      return;
    }
    if (!cached) setLoading(true);
    try {
      const next = await loadKapsami(force);
      setData(next);
      setError(null);
    } catch (err) {
      console.warn("[useHaritaKapsami]", err);
      setError("Kapsam sayılamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll(false);
    const id = window.setInterval(() => void poll(false), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  return { data, loading, error, refresh: () => poll(true) };
}
