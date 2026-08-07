"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MusteriFavori } from "@/lib/types";

interface FavoriToggleResult {
  favori: boolean;
  not_metni: string | null;
}

export function useMusteriFavoriler() {
  const [items, setItems] = useState<MusteriFavori[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const favoriKodlari = useMemo(
    () => new Set(items.map((i) => i.musteri_kodu)),
    [items]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/musteri/favori");
      const payload = (await res.json().catch(() => ({}))) as {
        items?: MusteriFavori[];
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
      musteriKodu: string,
      opts?: { not_metni?: string | null; snapshot?: MusteriFavori }
    ): Promise<FavoriToggleResult> => {
      let rollback: MusteriFavori[] = [];

      setItems((prev) => {
        rollback = prev;
        const wasFavori = prev.some((i) => i.musteri_kodu === musteriKodu);
        const optimisticFavori = !wasFavori;
        const optimisticNote =
          opts && "not_metni" in opts
            ? (opts.not_metni ?? null)
            : (prev.find((i) => i.musteri_kodu === musteriKodu)?.not_metni ??
              null);

        if (!optimisticFavori) {
          return prev.filter((i) => i.musteri_kodu !== musteriKodu);
        }
        const existing = prev.find((i) => i.musteri_kodu === musteriKodu);
        if (existing) {
          return prev.map((i) =>
            i.musteri_kodu === musteriKodu
              ? { ...i, not_metni: optimisticNote }
              : i
          );
        }
        const snap = opts?.snapshot;
        if (!snap) return prev;
        return [
          {
            ...snap,
            favori_id: snap.favori_id || `tmp-${musteriKodu}`,
            not_metni: optimisticNote,
            olusturulma: snap.olusturulma || new Date().toISOString(),
          },
          ...prev.filter((i) => i.musteri_kodu !== musteriKodu),
        ];
      });

      try {
        const res = await fetch("/api/musteri/favori", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            musteri_kodu: musteriKodu,
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
          if (!nextFavori) {
            return prev.filter((i) => i.musteri_kodu !== musteriKodu);
          }
          const existing = prev.find((i) => i.musteri_kodu === musteriKodu);
          if (existing) {
            return prev.map((i) =>
              i.musteri_kodu === musteriKodu
                ? { ...i, not_metni: nextNote }
                : i
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
              favori_id: snap.favori_id || `tmp-${musteriKodu}`,
              not_metni: nextNote,
              olusturulma: snap.olusturulma || new Date().toISOString(),
            },
            ...prev.filter((i) => i.musteri_kodu !== musteriKodu),
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

  const updateNote = useCallback(
    async (musteriKodu: string, not_metni: string | null) => {
      const res = await fetch("/api/musteri/favori", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          musteri_kodu: musteriKodu,
          action: "note",
          not_metni,
        }),
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
        prev.map((i) =>
          i.musteri_kodu === musteriKodu ? { ...i, not_metni: nextNote } : i
        )
      );
      return nextNote;
    },
    []
  );

  const isFavori = useCallback(
    (musteriKodu: string) => favoriKodlari.has(musteriKodu),
    [favoriKodlari]
  );

  const getNote = useCallback(
    (musteriKodu: string) =>
      items.find((i) => i.musteri_kodu === musteriKodu)?.not_metni ?? null,
    [items]
  );

  return {
    items,
    favoriKodlari,
    loading,
    error,
    refresh,
    toggle,
    updateNote,
    isFavori,
    getNote,
  };
}
