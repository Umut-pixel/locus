import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLatestCompletedSyncs } from "./fetch-panorama";

/** Ana zincir — birbiri ardına completed olmalı. */
export const CORE_PANORAMA_REPORT_IDS = [5020, 5500, 5130] as const;

/** Tek başına gelen opsiyonel zincirler — tazelik kapısı yok. */
export const INDEPENDENT_PANORAMA_REPORT_IDS = [5450, 5530] as const;

/** Ana zincir sync'lerinin hepsinin "şimdi"ye göre max yaşı. */
export const CORE_SYNC_FRESHNESS_MS = 5 * 60 * 1000;

export type FreshnessGateResult =
  | { ok: true }
  | { ok: false; reason: string; details?: Record<string, unknown> };

/**
 * 5020/5500/5130 son completed sync'leri son `windowMs` içinde mi?
 * Değilse ana zincir henüz bitmemiş / karışık nesil — transform atlanmalı.
 */
export async function corePanoramaSyncsAreFresh(
  admin: SupabaseClient,
  windowMs: number = CORE_SYNC_FRESHNESS_MS
): Promise<FreshnessGateResult> {
  const syncs = await fetchLatestCompletedSyncs(admin, [
    ...CORE_PANORAMA_REPORT_IDS,
  ]);

  const now = Date.now();
  const perReport: Record<string, string | null> = {};

  for (const id of CORE_PANORAMA_REPORT_IDS) {
    const row = syncs.get(id);
    if (!row) {
      return {
        ok: false,
        reason: `missing_completed_${id}`,
        details: { perReport },
      };
    }
    const ts = row.tamamlandi_at ?? row.cekildi_at;
    perReport[String(id)] = ts;
    if (!ts) {
      return {
        ok: false,
        reason: `missing_timestamp_${id}`,
        details: { perReport },
      };
    }
    const age = now - new Date(ts).getTime();
    if (Number.isNaN(age) || age > windowMs) {
      return {
        ok: false,
        reason: "stale",
        details: {
          perReport,
          windowMs,
          staleReportId: id,
          ageMs: age,
        },
      };
    }
  }

  return { ok: true };
}

export function isIndependentPanoramaReport(
  reportId: number | null | undefined
): boolean {
  if (reportId == null || Number.isNaN(reportId)) return false;
  return (INDEPENDENT_PANORAMA_REPORT_IDS as readonly number[]).includes(
    reportId
  );
}
