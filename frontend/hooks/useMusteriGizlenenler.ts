"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MusteriGizlenen } from "@/lib/types";

interface GizleToggleResult {
  gizle: boolean;
}

export function useMusteriGizlenenler() {
  const [items, setItems] = useState<MusteriGizlenen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const gizlenenKodlari = useMemo(
    () => new Set(items.map((i) => i.musteri_kodu)),
    [items]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/musteri/gizle");
      const payload = (await res.json().catch(() => ({}))) as {
        items?: MusteriGizlenen[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? `Gizlenenler yüklenemedi (${res.status})`);
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
      opts?: { snapshot?: MusteriGizlenen }
    ): Promise<GizleToggleResult> => {
      const res = await fetch("/api/musteri/gizle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musteri_kodu: musteriKodu }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        gizle?: boolean;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? `Gizleme güncellenemedi (${res.status})`);
      }

      const nextGizle = Boolean(payload.gizle);

      setItems((prev) => {
        if (!nextGizle) {
          return prev.filter((i) => i.musteri_kodu !== musteriKodu);
        }
        const existing = prev.find((i) => i.musteri_kodu === musteriKodu);
        if (existing) return prev;
        const snap = opts?.snapshot;
        if (!snap) {
          void refresh();
          return prev;
        }
        return [
          {
            ...snap,
            gizle_id: snap.gizle_id || `tmp-${musteriKodu}`,
            olusturulma: snap.olusturulma || new Date().toISOString(),
          },
          ...prev.filter((i) => i.musteri_kodu !== musteriKodu),
        ];
      });

      return { gizle: nextGizle };
    },
    [refresh]
  );

  const isGizlenen = useCallback(
    (musteriKodu: string) => gizlenenKodlari.has(musteriKodu),
    [gizlenenKodlari]
  );

  return {
    items,
    gizlenenKodlari,
    loading,
    error,
    refresh,
    toggle,
    isGizlenen,
  };
}
