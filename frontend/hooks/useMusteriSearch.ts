"use client";

import { useEffect, useState } from "react";

import { MUSTERILER_HARITA_VIEW, supabase } from "@/lib/supabase";
import type { MusteriHarita } from "@/lib/types";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const LIMIT = 12;

export type MusteriSearchHit = Pick<
  MusteriHarita,
  | "musteri_kodu"
  | "unvan"
  | "adres"
  | "sehir"
  | "ilce"
  | "lat"
  | "lon"
  | "risk_durumu"
>;

const SEARCH_SELECT =
  "musteri_kodu,unvan,adres,sehir,ilce,lat,lon,risk_durumu";

function escapeIlike(q: string): string {
  return q
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, '""');
}

export function useMusteriSearch(query: string) {
  const [results, setResults] = useState<MusteriSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      const pattern = `%${escapeIlike(q)}%`;
      const { data, error: err } = await supabase
        .from(MUSTERILER_HARITA_VIEW)
        .select(SEARCH_SELECT)
        .or(
          `unvan.ilike."${pattern}",adres.ilike."${pattern}",musteri_kodu.ilike."${pattern}"`
        )
        .limit(LIMIT)
        .abortSignal(ac.signal);

      if (ac.signal.aborted) return;

      if (err) {
        setError(err.message);
        setResults([]);
        setLoading(false);
        return;
      }

      setResults((data ?? []) as MusteriSearchHit[]);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return { results, loading, error };
}
