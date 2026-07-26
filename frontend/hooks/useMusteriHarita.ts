"use client";

import { useCallback, useEffect, useState } from "react";

import { MUSTERILER_HARITA_VIEW, supabase } from "@/lib/supabase";
import type { MusteriHarita } from "@/lib/types";

interface MusteriHaritaState {
  data: MusteriHarita[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const PAGE_SIZE = 1000;

export function useMusteriHarita(): MusteriHaritaState {
  const [data, setData] = useState<MusteriHarita[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const rows: MusteriHarita[] = [];
        let from = 0;

        for (;;) {
          const { data: page, error: pageError } = await supabase
            .from(MUSTERILER_HARITA_VIEW)
            .select("*")
            .order("musteri_kodu", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (pageError) throw pageError;
          if (!page || page.length === 0) break;

          rows.push(...(page as MusteriHarita[]));
          if (page.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        if (!cancelled) {
          setData(rows);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setData([]);
          setLoading(false);
          setError(err instanceof Error ? err.message : "Bilinmeyen hata");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { data, loading, error, refresh };
}
