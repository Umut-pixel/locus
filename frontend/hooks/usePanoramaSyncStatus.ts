"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  formatIstanbulStamp,
  nextPanoramaSyncStamp,
} from "@/lib/panorama-schedule";
import {
  PANORAMA_SYNC_DOSYA_TIPI,
  PANORAMA_SYNC_RUNS_TABLE,
  YUKLEME_LOGLARI_TABLE,
  supabase,
} from "@/lib/supabase";

const POLL_MS = 3 * 60 * 1000; // 3 dk
const REPORT_IDS = [5020, 5500, 5130, 5450, 5530] as const;

export interface SyncStatusSnapshot {
  /** En son tamamlanan sync (5020/5500/5130 arası max tamamlandi_at) */
  lastSyncAt: string | null;
  /** Son PanoramaSync transform zamanı */
  lastTransformAt: string | null;
  /** Transform’un uyguladığı sync id set fingerprint */
  transformSyncKey: string | null;
  /** Landing sync fingerprint (üç rapor id birleşimi) */
  landingSyncKey: string | null;
  /** Herhangi bir son sync’te hata metni */
  syncError: string | null;
  /** Transform, landing’den geride */
  transformPending: boolean;
}

interface UsePanoramaSyncStatusOptions {
  /** Transform log’u yeni görününce haritayı yenile */
  onTransformApplied?: () => void;
  enabled?: boolean;
}

function fingerprint(ids: Record<string, string | null> | null): string | null {
  if (!ids) return null;
  const a = ids["5020"] ?? "";
  const b = ids["5500"] ?? "";
  const c = ids["5130"] ?? "";
  const d = ids["5450"] ?? "";
  const e = ids["5530"] ?? "";
  if (!a && !b && !c && !d && !e) return null;
  return `${a}|${b}|${c}|${d}|${e}`;
}
export function usePanoramaSyncStatus(
  options: UsePanoramaSyncStatusOptions = {}
) {
  const { onTransformApplied, enabled = true } = options;
  const [status, setStatus] = useState<SyncStatusSnapshot>({
    lastSyncAt: null,
    lastTransformAt: null,
    transformSyncKey: null,
    landingSyncKey: null,
    syncError: null,
    transformPending: false,
  });
  const [loading, setLoading] = useState(true);
  const knownTransformKeyRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const onTransformRef = useRef(onTransformApplied);
  onTransformRef.current = onTransformApplied;

  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    try {
      const landingIds: Record<string, string> = {};
      let lastSyncAt: string | null = null;
      let syncError: string | null = null;

      for (const reportId of REPORT_IDS) {
        const { data, error } = await supabase
          .from(PANORAMA_SYNC_RUNS_TABLE)
          .select("id,report_id,durum,tamamlandi_at,cekildi_at,hata")
          .eq("report_id", reportId)
          .order("cekildi_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!data) continue;

        if (data.durum === "completed") {
          landingIds[String(reportId)] = data.id as string;
          const ts = (data.tamamlandi_at ?? data.cekildi_at) as string | null;
          if (ts && (!lastSyncAt || ts > lastSyncAt)) lastSyncAt = ts;
        } else if (data.hata) {
          syncError = String(data.hata);
        } else if (data.durum !== "completed") {
          syncError = syncError ?? `Rapor ${reportId}: ${data.durum}`;
        }
      }

      const { data: log, error: logError } = await supabase
        .from(YUKLEME_LOGLARI_TABLE)
        .select("uyarilar, yuklenme_zamani")
        .eq("dosya_tipi", PANORAMA_SYNC_DOSYA_TIPI)
        .eq("durum", "ok")
        .order("yuklenme_zamani", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (logError) throw logError;

      let transformSyncKey: string | null = null;
      let lastTransformAt: string | null = null;
      if (log) {
        lastTransformAt = (log.yuklenme_zamani as string) ?? null;
        const uyarilar = log.uyarilar as Record<string, unknown> | null;
        const syncIds =
          uyarilar &&
          typeof uyarilar === "object" &&
          uyarilar.sync_ids &&
          typeof uyarilar.sync_ids === "object"
            ? (uyarilar.sync_ids as Record<string, string>)
            : null;
        transformSyncKey = fingerprint(syncIds);
      }

      const landingSyncKey = fingerprint(landingIds);
      const transformPending =
        Boolean(
          landingSyncKey &&
            transformSyncKey &&
            landingSyncKey !== transformSyncKey
        ) || Boolean(landingSyncKey && !transformSyncKey);

      setStatus({
        lastSyncAt,
        lastTransformAt,
        transformSyncKey,
        landingSyncKey,
        syncError,
        transformPending,
      });

      if (!initializedRef.current) {
        knownTransformKeyRef.current = transformSyncKey;
        initializedRef.current = true;
      } else if (
        transformSyncKey &&
        transformSyncKey !== knownTransformKeyRef.current
      ) {
        knownTransformKeyRef.current = transformSyncKey;
        onTransformRef.current?.();
      }
    } catch (err) {
      console.warn("[usePanoramaSyncStatus]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, poll]);

  const label = (() => {
    if (status.syncError) return `Sync uyarı: ${status.syncError.slice(0, 40)}`;
    if (status.transformPending) {
      const t = formatIstanbulStamp(status.lastSyncAt);
      return t
        ? `Sync alındı ${t} — harita bekleniyor`
        : "Harita güncellemesi bekleniyor";
    }
    const t = formatIstanbulStamp(status.lastTransformAt ?? status.lastSyncAt);
    return t ? `Son sync: ${t}` : null;
  })();

  const nextStamp = nextPanoramaSyncStamp();

  return { status, loading, label, nextStamp, refreshStatus: poll };
}
