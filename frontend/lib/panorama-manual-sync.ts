import { formatIstanbulStamp } from "@/lib/panorama-schedule";
import { PANORAMA_SYNC_RUNS_TABLE, supabase } from "@/lib/supabase";

export const MANUAL_SYNC_STORAGE_KEY = "locus:panorama-manual-sync-at";
export const MANUAL_SYNC_COOLDOWN_MS = 60 * 60 * 1000;

/** Zincirler arası n8n Wait. */
export const MANUAL_CHAIN_WAIT_SEC = 180;
const WAIT_COUNT = 4;
const CHAIN_COUNT = 5;
const SCRAPE_SEC_PER_CHAIN = 180;
export const MANUAL_ESTIMATE_MS =
  (WAIT_COUNT * MANUAL_CHAIN_WAIT_SEC + CHAIN_COUNT * SCRAPE_SEC_PER_CHAIN) *
  1000;

const LAST_REPORT_ID = 5430;
const POLL_MS = 15_000;
const DEADLINE_MS = 90 * 60 * 1000;

export function manualSyncEtaStamp(from = new Date()): string {
  return (
    formatIstanbulStamp(new Date(from.getTime() + MANUAL_ESTIMATE_MS)) ?? "—"
  );
}

export function manualSyncToastDescription(from = new Date()): string {
  return `Zincirler arası ${MANUAL_CHAIN_WAIT_SEC} sn bekleniyor. Tahmini bitiş: ${manualSyncEtaStamp(from)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Son zincir (stok 5430) tetikten sonra completed olana kadar bekler. */
export async function waitForManualPipeline(startedAt: number): Promise<string> {
  const deadline = startedAt + DEADLINE_MS;
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("cekildi_at,durum")
      .eq("report_id", LAST_REPORT_ID)
      .eq("durum", "completed")
      .order("cekildi_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Sync durumu okunamadı: ${error.message}`);
    }
    const raw = data?.[0]?.cekildi_at;
    const at = raw ? Date.parse(String(raw)) : NaN;
    if (Number.isFinite(at) && at >= startedAt - 15_000) {
      return "Tüm rapor zincirleri tamamlandı. Harita az sonra güncellenir.";
    }
    await sleep(POLL_MS);
  }
  throw new Error("Çekim zaman aşımına uğradı. n8n execution loguna bakın.");
}
