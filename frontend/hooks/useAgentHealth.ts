"use client";

import { useCallback, useEffect, useState } from "react";

export type AgentHealthPayload =
  | { ok: true; configured: true; latencyMs: number }
  | { ok: false; configured: false; error: string }
  | { ok: false; configured: true; error: string; latencyMs?: number };

export function useAgentHealth() {
  const [payload, setPayload] = useState<AgentHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ayarlar/agent-health", { cache: "no-store" });
      const body = (await res.json()) as AgentHealthPayload;
      setPayload(body);
    } catch {
      setPayload({
        ok: false,
        configured: true,
        error: "Analyst sağlık kontrolü alınamadı.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { payload, loading, reload: load };
}
