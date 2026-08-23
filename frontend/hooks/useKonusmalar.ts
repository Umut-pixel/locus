"use client";

import { useCallback, useEffect, useState } from "react";

import {
  KONUSMALAR_CHANGED,
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
      setItems(Array.isArray(body.items) ? body.items : []);
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

  return { items, loading, refresh };
}
