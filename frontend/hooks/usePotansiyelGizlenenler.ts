"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PotansiyelGizlenen } from "@/lib/types";

interface GizleToggleResult {
  gizle: boolean;
}

export function usePotansiyelGizlenenler() {
  const [items, setItems] = useState<PotansiyelGizlenen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const gizlenenIds = useMemo(
    () => new Set(items.map((i) => i.id)),
    [items]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/potansiyel/gizle");
      const payload = (await res.json().catch(() => ({}))) as {
        items?: PotansiyelGizlenen[];
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
      potansiyelId: string,
      opts?: { snapshot?: PotansiyelGizlenen }
    ): Promise<GizleToggleResult> => {
      const res = await fetch("/api/potansiyel/gizle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: potansiyelId }),
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
          return prev.filter((i) => i.id !== potansiyelId);
        }
        const existing = prev.find((i) => i.id === potansiyelId);
        if (existing) return prev;
        const snap = opts?.snapshot;
        if (!snap) {
          void refresh();
          return prev;
        }
        return [
          {
            ...snap,
            gizle_id: snap.gizle_id || `tmp-${potansiyelId}`,
            olusturulma: snap.olusturulma || new Date().toISOString(),
          },
          ...prev.filter((i) => i.id !== potansiyelId),
        ];
      });

      return { gizle: nextGizle };
    },
    [refresh]
  );

  const isGizlenen = useCallback(
    (id: string) => gizlenenIds.has(id),
    [gizlenenIds]
  );

  return {
    items,
    gizlenenIds,
    loading,
    error,
    refresh,
    toggle,
    isGizlenen,
  };
}
