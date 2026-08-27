"use client";

import { useCallback, useEffect, useState } from "react";

import type { UsageGunAraligi, UsagePayload } from "@/lib/anthropic-usage";

export function useAnthropicUsage(days: UsageGunAraligi) {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const q = fresh ? "&fresh=1" : "";
      const res = await fetch(`/api/ayarlar/usage?days=${days}${q}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as UsagePayload;
      setPayload(body);
    } catch {
      setPayload({
        ok: false,
        configured: true,
        error: "Kullanım raporu alınamadı. Ağı kontrol edip yeniden deneyin.",
      });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { payload, loading, reload: () => load(true) };
}
