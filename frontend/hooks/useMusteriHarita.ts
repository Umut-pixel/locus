"use client";

import { useEffect, useState } from "react";

import { MUSTERILER_HARITA_VIEW, supabase } from "@/lib/supabase";
import type { MusteriHarita } from "@/lib/types";

interface MusteriHaritaState {
  data: MusteriHarita[];
  loading: boolean;
  error: string | null;
}

const PAGE_SIZE = 1000;

export function useMusteriHarita(): MusteriHaritaState {
  const [state, setState] = useState<MusteriHaritaState>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const rows: MusteriHarita[] = [];
        let from = 0;

        for (;;) {
          const { data, error } = await supabase
            .from(MUSTERILER_HARITA_VIEW)
            .select("*")
            .order("musteri_kodu", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;

          rows.push(...(data as MusteriHarita[]));
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        if (!cancelled) setState({ data: rows, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            data: [],
            loading: false,
            error: err instanceof Error ? err.message : "Bilinmeyen hata",
          });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
