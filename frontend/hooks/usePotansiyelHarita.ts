"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  POTANSIYEL_MUSTERILER_HARITA_VIEW,
  supabase,
} from "@/lib/supabase";
import type { PotansiyelHarita } from "@/lib/types";

const PAGE_SIZE = 1000;
/** SELECT değişince eski modül cache’ini geçersiz kıl. */
const CACHE_VERSION = 2;
const SELECT =
  "id,kaynak_id,isim,adres,ilce,il,lat,lon,primary_type,google_types,kalite_bayragi,tarandigi_tarih";

/** Modül cache — toggle kapatılınca yeniden indirmeyi önler. */
let cachedRows: PotansiyelHarita[] | null = null;
let cachedVersion = 0;

function getCached(): PotansiyelHarita[] | null {
  if (cachedVersion !== CACHE_VERSION) {
    cachedRows = null;
    return null;
  }
  return cachedRows;
}

function asStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v)).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function asPotansiyel(rows: unknown[]): PotansiyelHarita[] {
  const out: PotansiyelHarita[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      id: String(r.id),
      kaynak_id: (r.kaynak_id as string | null) ?? null,
      isim: (r.isim as string | null) ?? null,
      adres: (r.adres as string | null) ?? null,
      ilce: (r.ilce as string | null) ?? null,
      il: (r.il as string | null) ?? null,
      lat,
      lon,
      primary_type: (r.primary_type as string | null) ?? null,
      google_types: asStringArray(r.google_types),
      kalite_bayragi: (r.kalite_bayragi as string | null) ?? null,
      tarandigi_tarih: (r.tarandigi_tarih as string | null) ?? null,
    });
  }
  return out;
}

async function fetchAllPotansiyel(
  signal?: AbortSignal
): Promise<PotansiyelHarita[]> {
  let q = supabase
    .from(POTANSIYEL_MUSTERILER_HARITA_VIEW)
    .select(SELECT, { count: "exact" })
    .not("lat", "is", null)
    .not("lon", "is", null)
    .order("id", { ascending: true })
    .range(0, PAGE_SIZE - 1);
  if (signal) q = q.abortSignal(signal);

  const first = await q;
  if (first.error) throw first.error;

  const page0 = asPotansiyel(first.data ?? []);
  const total = first.count ?? page0.length;
  if (page0.length >= total || page0.length < PAGE_SIZE) return page0;

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const pages: PotansiyelHarita[][] = new Array(pageCount);
  pages[0] = page0;
  const CONCURRENCY = 3;
  const rest = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);

  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = rest.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (pageIndex) => {
        const from = pageIndex * PAGE_SIZE;
        let pageQ = supabase
          .from(POTANSIYEL_MUSTERILER_HARITA_VIEW)
          .select(SELECT)
          .not("lat", "is", null)
          .not("lon", "is", null)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (signal) pageQ = pageQ.abortSignal(signal);
        const res = await pageQ;
        if (res.error) throw res.error;
        return {
          pageIndex,
          rows: asPotansiyel(res.data ?? []),
        };
      })
    );
    for (const { pageIndex, rows } of results) {
      pages[pageIndex] = rows;
    }
  }

  return pages.flatMap((p) => p ?? []);
}

interface UsePotansiyelHaritaOptions {
  /** Toggle açıkken fetch; kapalıyken ağ yok (cache varsa döner). */
  enabled: boolean;
}

export function usePotansiyelHarita({ enabled }: UsePotansiyelHaritaOptions) {
  const [data, setData] = useState<PotansiyelHarita[]>(() => getCached() ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const fetchedRef = useRef(Boolean(getCached()?.length));

  const refresh = useCallback(() => {
    cachedRows = null;
    cachedVersion = 0;
    fetchedRef.current = false;
    setRefreshKey((k) => k + 1);
  }, []);

  const removeLocal = useCallback((id: string) => {
    setData((prev) => {
      const next = prev.filter((r) => r.id !== id);
      cachedRows = next;
      cachedVersion = CACHE_VERSION;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const hit = getCached();
    if (fetchedRef.current && hit?.length) {
      setData(hit);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchAllPotansiyel(ac.signal);
        if (cancelled || ac.signal.aborted) return;
        cachedRows = rows;
        cachedVersion = CACHE_VERSION;
        fetchedRef.current = true;
        setData(rows);
        setLoading(false);
      } catch (err) {
        if (cancelled || ac.signal.aborted) return;
        if ((err as Error)?.name === "AbortError") return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Bilinmeyen hata");
      }
    }

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [enabled, refreshKey]);

  return { data, loading, error, refresh, removeLocal };
}
