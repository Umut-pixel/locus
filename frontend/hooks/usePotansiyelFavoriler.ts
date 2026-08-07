"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PotansiyelFavori } from "@/lib/types";

interface FavoriToggleResult {
  favori: boolean;
  not_metni: string | null;
}

export function usePotansiyelFavoriler() {
  const [items, setItems] = useState<PotansiyelFavori[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const favoriIds = useMemo(
    () => new Set(items.map((i) => i.id)),
    [items]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/potansiyel/favori");
      const payload = (await res.json().catch(() => ({}))) as {
        items?: PotansiyelFavori[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? `Favoriler yüklenemedi (${res.status})`);
      }
      setItems(payload.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (
      id: string,
      opts?: { not_metni?: string | null; snapshot?: PotansiyelFavori }
    ): Promise<FavoriToggleResult> => {
      let rollback: PotansiyelFavori[] = [];

      setItems((prev) => {
        rollback = prev;
        const wasFavori = prev.some((i) => i.id === id);
        const optimisticFavori = !wasFavori;
        const optimisticNote =
          opts && "not_metni" in opts
            ? (opts.not_metni ?? null)
            : (prev.find((i) => i.id === id)?.not_metni ?? null);

        if (!optimisticFavori) return prev.filter((i) => i.id !== id);
        const existing = prev.find((i) => i.id === id);
        if (existing) {
          return prev.map((i) =>
            i.id === id ? { ...i, not_metni: optimisticNote } : i
          );
        }
        const snap = opts?.snapshot;
        if (!snap) return prev;
        return [
          {
            ...snap,
            favori_id: snap.favori_id || `tmp-${id}`,
            not_metni: optimisticNote,
            olusturulma: snap.olusturulma || new Date().toISOString(),
          },
          ...prev.filter((i) => i.id !== id),
        ];
      });

      try {
        const res = await fetch("/api/potansiyel/favori", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            action: "toggle",
            ...(opts && "not_metni" in opts
              ? { not_metni: opts.not_metni ?? null }
              : {}),
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          favori?: boolean;
          not_metni?: string | null;
        };
        if (!res.ok) {
          throw new Error(
            payload.error ?? `Favori güncellenemedi (${res.status})`
          );
        }

        const nextFavori = Boolean(payload.favori);
        const nextNote = payload.not_metni ?? null;

        setItems((prev) => {
          if (!nextFavori) return prev.filter((i) => i.id !== id);
          const existing = prev.find((i) => i.id === id);
          if (existing) {
            return prev.map((i) =>
              i.id === id ? { ...i, not_metni: nextNote } : i
            );
          }
          const snap = opts?.snapshot;
          if (!snap) {
            void refresh();
            return prev;
          }
          return [
            {
              ...snap,
              favori_id: snap.favori_id || `tmp-${id}`,
              not_metni: nextNote,
              olusturulma: snap.olusturulma || new Date().toISOString(),
            },
            ...prev.filter((i) => i.id !== id),
          ];
        });

        return { favori: nextFavori, not_metni: nextNote };
      } catch (err) {
        setItems(rollback);
        throw err;
      }
    },
    [refresh]
  );

  const updateNote = useCallback(async (id: string, not_metni: string | null) => {
    const res = await fetch("/api/potansiyel/favori", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "note", not_metni }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      not_metni?: string | null;
    };
    if (!res.ok) {
      throw new Error(payload.error ?? `Not kaydedilemedi (${res.status})`);
    }
    const nextNote = payload.not_metni ?? null;
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, not_metni: nextNote } : i))
    );
    return nextNote;
  }, []);

  const isFavori = useCallback(
    (id: string) => favoriIds.has(id),
    [favoriIds]
  );

  const getNote = useCallback(
    (id: string) => items.find((i) => i.id === id)?.not_metni ?? null,
    [items]
  );

  const removeLocal = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return {
    items,
    favoriIds,
    loading,
    error,
    refresh,
    toggle,
    updateNote,
    isFavori,
    getNote,
    removeLocal,
  };
}
