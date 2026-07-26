"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  MUSTERI_HARITA_SELECT,
  clearMusteriCache,
  getMusteriCache,
  isMusteriCacheFresh,
  setMusteriCache,
} from "@/lib/musteri-cache";
import { MUSTERILER_HARITA_VIEW, supabase } from "@/lib/supabase";
import type { MusteriHarita } from "@/lib/types";

interface MusteriHaritaState {
  data: MusteriHarita[];
  /** İlk boyama henüz yok (cache de boş). */
  loading: boolean;
  /** Arka planda yenileniyor; harita mevcut veriyle açık kalır. */
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

const PAGE_SIZE = 1000;

function withAbort<T extends { abortSignal: (s: AbortSignal) => T }>(
  builder: T,
  signal: AbortSignal | undefined
): T {
  return signal ? builder.abortSignal(signal) : builder;
}

async function fetchAllMusteriler(
  onPage: (rows: MusteriHarita[], done: boolean) => void,
  signal?: AbortSignal
): Promise<MusteriHarita[]> {
  const first = await withAbort(
    supabase
      .from(MUSTERILER_HARITA_VIEW)
      .select(MUSTERI_HARITA_SELECT, { count: "exact" })
      .order("musteri_kodu", { ascending: true })
      .range(0, PAGE_SIZE - 1),
    signal
  );

  if (first.error) throw first.error;
  const page0 = (first.data ?? []) as unknown as MusteriHarita[];
  const total = first.count ?? page0.length;

  onPage(page0, page0.length >= total);

  if (page0.length >= total || page0.length < PAGE_SIZE) {
    return page0;
  }

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const restIndexes = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);
  const CONCURRENCY = 3;
  const pages: MusteriHarita[][] = new Array(pageCount);
  pages[0] = page0;

  for (let i = 0; i < restIndexes.length; i += CONCURRENCY) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = restIndexes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (pageIndex) => {
        const from = pageIndex * PAGE_SIZE;
        const res = await withAbort(
          supabase
            .from(MUSTERILER_HARITA_VIEW)
            .select(MUSTERI_HARITA_SELECT)
            .order("musteri_kodu", { ascending: true })
            .range(from, from + PAGE_SIZE - 1),
          signal
        );
        if (res.error) throw res.error;
        return {
          pageIndex,
          rows: (res.data ?? []) as unknown as MusteriHarita[],
        };
      })
    );

    for (const { pageIndex, rows } of results) {
      pages[pageIndex] = rows;
    }

    const merged = pages.flatMap((p) => p ?? []);
    onPage(merged, merged.length >= total);
  }

  return pages.flatMap((p) => p ?? []);
}

export function useMusteriHarita(): MusteriHaritaState {
  const initial = getMusteriCache();
  const [data, setData] = useState<MusteriHarita[]>(() => initial ?? []);
  const [loading, setLoading] = useState(() => !initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefetchRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    clearMusteriCache();
    forceRefetchRef.current = true;
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const cached = getMusteriCache();
    const hasCache = Boolean(cached?.length);
    const force = forceRefetchRef.current;
    forceRefetchRef.current = false;

    if (hasCache && cached) {
      setData(cached);
      setLoading(false);
    }

    // Taze cache + zorunlu yenileme yoksa ağı atla
    if (hasCache && isMusteriCacheFresh() && !force) {
      return () => ac.abort();
    }

    let cancelled = false;

    async function run() {
      if (hasCache) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const rows = await fetchAllMusteriler((partial) => {
          if (cancelled || ac.signal.aborted) return;
          setData(partial);
          if (partial.length > 0) setLoading(false);
        }, ac.signal);

        if (!cancelled && !ac.signal.aborted) {
          setData(rows);
          setMusteriCache(rows);
          setLoading(false);
          setRefreshing(false);
          setError(null);
        }
      } catch (err) {
        if (cancelled || ac.signal.aborted) return;
        if ((err as Error)?.name === "AbortError") return;
        if (!hasCache) setData([]);
        setLoading(false);
        setRefreshing(false);
        setError(err instanceof Error ? err.message : "Bilinmeyen hata");
      }
    }

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [refreshKey]);

  return { data, loading, refreshing, error, refresh };
}
