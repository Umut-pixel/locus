import type { SupabaseClient } from "@supabase/supabase-js";

import type { SyncRunSummary } from "./types";

export const PANORAMA_MUSTERI_VIEW = "v_panorama_musteri_listesi_guncel";
export const PANORAMA_RUT_VIEW = "v_panorama_rut_tanim_listesi_guncel";
export const PANORAMA_SEVKIYAT_VIEW = "v_panorama_sevkiyat_raporu_kup_guncel";
export const PANORAMA_BELGE_DETAY_VIEW =
  "v_panorama_belge_detay_raporu_guncel";
export const PANORAMA_YASLANDIRMA_VIEW =
  "v_panorama_acik_fatura_vade_kup_guncel";
export const PANORAMA_TAHSILAT_VIEW = "v_panorama_tahsilat_raporu_guncel";
export const PANORAMA_SYNC_RUNS_TABLE = "panorama_sync_runs";
export const PANORAMA_SYNC_DOSYA_TIPI = "PanoramaSync";

const PAGE = 1000;

/**
 * View'dan tüm satırları sayfalı çek.
 * PostgREST range sıralamasız güvenilmez — mutlaka orderBy gerekir.
 * count ile eksik sayfa yakalanır (max_rows / sessiz kesme).
 */
export async function fetchAllFromView(
  admin: SupabaseClient,
  view: string,
  orderBy = "id"
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let from = 0;
  let total: number | null = null;

  for (;;) {
    const q = admin
      .from(view)
      .select("*", from === 0 ? { count: "exact" } : undefined)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);

    const { data, error, count } = await q;

    if (error) {
      throw new Error(`${view} okunamadı: ${error.message}`);
    }

    if (from === 0 && typeof count === "number") {
      total = count;
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  if (total != null && out.length !== total) {
    throw new Error(
      `${view}: beklenen ${total} satır, okunan ${out.length} — sayfalama eksik.`
    );
  }

  return out;
}

export async function fetchLatestCompletedSyncs(
  admin: SupabaseClient,
  reportIds: number[] = [5020, 5500, 5130, 5450, 5530, 5230]
): Promise<Map<number, SyncRunSummary>> {
  const map = new Map<number, SyncRunSummary>();

  for (const reportId of reportIds) {
    const { data, error } = await admin
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("id,report_id,durum,satir_sayisi,cekildi_at,tamamlandi_at,hata")
      .eq("report_id", reportId)
      .eq("durum", "completed")
      .order("cekildi_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `panorama_sync_runs (${reportId}) okunamadı: ${error.message}`
      );
    }
    if (data) {
      map.set(reportId, data as SyncRunSummary);
    }
  }

  return map;
}

export async function fetchLastPanoramaTransformMeta(
  admin: SupabaseClient
): Promise<{
  syncIds: Record<string, string | null> | null;
  yuklenmeZamani: string | null;
}> {
  const { data, error } = await admin
    .from("yukleme_loglari")
    .select("uyarilar, yuklenme_zamani")
    .eq("dosya_tipi", PANORAMA_SYNC_DOSYA_TIPI)
    .eq("durum", "ok")
    .order("yuklenme_zamani", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Son PanoramaSync logu okunamadı: ${error.message}`);
  }
  if (!data) return { syncIds: null, yuklenmeZamani: null };

  const uyarilar = data.uyarilar as Record<string, unknown> | null;
  const syncIds =
    uyarilar &&
    typeof uyarilar === "object" &&
    uyarilar.sync_ids &&
    typeof uyarilar.sync_ids === "object"
      ? (uyarilar.sync_ids as Record<string, string | null>)
      : null;

  return {
    syncIds,
    yuklenmeZamani: (data.yuklenme_zamani as string) ?? null,
  };
}
