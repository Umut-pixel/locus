"use client";

import { useCallback, useEffect, useState } from "react";

import {
  KONUSMALAR_CHANGED,
  notifyKonusmalarChanged,
  sortKonusmalar,
  type KonusmaOzet,
} from "@/lib/agent-konusma";

export function useKonusmalar() {
  const [items, setItems] = useState<KonusmaOzet[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/konusmalar");
      if (!res.ok) return;
      const body = (await res.json()) as { items?: KonusmaOzet[] };
      setItems(sortKonusmalar(Array.isArray(body.items) ? body.items : []));
    } catch {
      /* ağ / oturum — liste boş kalsın */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(KONUSMALAR_CHANGED, onChange);
    return () => window.removeEventListener(KONUSMALAR_CHANGED, onChange);
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    let snapshot: KonusmaOzet[] = [];
    setItems((xs) => {
      snapshot = xs;
      return xs.filter((x) => x.id !== id);
    });
    try {
      const res = await fetch(`/api/agent/konusmalar/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("silinemedi");
      notifyKonusmalarChanged();
      return true;
    } catch {
      setItems(snapshot);
      void refresh();
      return false;
    }
  }, [refresh]);

  const togglePin = useCallback(
    async (id: string, next: boolean) => {
      let snapshot: KonusmaOzet[] = [];
      setItems((xs) => {
        snapshot = xs;
        return sortKonusmalar(
          xs.map((x) => (x.id === id ? { ...x, sabitlendi: next } : x))
        );
      });
      try {
        const res = await fetch(`/api/agent/konusmalar/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sabitlendi: next }),
        });
        if (!res.ok) throw new Error("sabitlenemedi");
        notifyKonusmalarChanged();
        return true;
      } catch {
        setItems(snapshot);
        void refresh();
        return false;
      }
    },
    [refresh]
  );

  return { items, loading, refresh, remove, togglePin };
}
