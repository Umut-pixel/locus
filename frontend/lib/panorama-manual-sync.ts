import {
  PANORAMA_ZINCIRLERI,
  tahminiSureMs,
  zincirleriCoz,
} from "@/lib/panorama-raporlar";
import { formatIstanbulStamp } from "@/lib/panorama-schedule";
import { PANORAMA_SYNC_RUNS_TABLE, supabase } from "@/lib/supabase";

export const MANUAL_SYNC_STORAGE_KEY = "locus:panorama-manual-sync-at";
export const MANUAL_SYNC_COOLDOWN_MS = 60 * 60 * 1000;

/** Son manuel çekim damgası — cooldown sayacı bunu okur. */
export function writeManualSyncAt(at: number) {
  try {
    window.localStorage.setItem(MANUAL_SYNC_STORAGE_KEY, String(at));
  } catch {
    /* private mode */
  }
}

/**
 * Zincirler arası n8n Wait. n8n'deki Wait node'ları `amount: 180`,
 * typeVersion 1.1 — v1.1+ varsayılan birim `seconds`, yani gerçekte 180 sn.
 * Sabit 60'ta kaldığı için toast yanlış bitiş saati gösteriyordu.
 */
export const MANUAL_CHAIN_WAIT_SEC = 180;
const WAIT_COUNT = 6;
const CHAIN_COUNT = 7;
const SCRAPE_SEC_PER_CHAIN = 180;
/** Tüm zincirler seçiliyken tahmini süre — seçim varsa `tahminiSureMs`. */
export const MANUAL_ESTIMATE_MS =
  (WAIT_COUNT * MANUAL_CHAIN_WAIT_SEC + CHAIN_COUNT * SCRAPE_SEC_PER_CHAIN) *
  1000;

const POLL_MS = 15_000;
const DEADLINE_MS = 90 * 60 * 1000;

/** Seçime göre süre; seçim yoksa (hepsi) ölçülmüş tam pipeline tahmini. */
function secimSuresiMs(secim?: readonly (string | number)[] | null): number {
  if (secim == null || secim.length === 0) return MANUAL_ESTIMATE_MS;
  const { zincirler } = zincirleriCoz(secim);
  return zincirler.length > 0 ? tahminiSureMs(zincirler) : MANUAL_ESTIMATE_MS;
}

/** Kaskadın sonunda tamamlanacak rapor — ilerleme takibi bunu bekler. */
function beklenecekId(secim?: readonly (string | number)[] | null): number {
  const { zincirler } = zincirleriCoz(secim ?? null);
  const son = zincirler[zincirler.length - 1] ?? PANORAMA_ZINCIRLERI[PANORAMA_ZINCIRLERI.length - 1]!;
  return son.bekleId;
}

export function manualSyncEtaStamp(
  from = new Date(),
  secim?: readonly (string | number)[] | null
): string {
  return (
    formatIstanbulStamp(new Date(from.getTime() + secimSuresiMs(secim))) ?? "—"
  );
}

export function manualSyncToastDescription(
  from = new Date(),
  secim?: readonly (string | number)[] | null
): string {
  const cokZincir = secim == null || secim.length !== 1;
  const bekleme = cokZincir
    ? `Zincirler arası ${MANUAL_CHAIN_WAIT_SEC} sn bekleniyor. `
    : "";
  return `${bekleme}Tahmini bitiş: ${manualSyncEtaStamp(from, secim)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Kaskadın son zinciri tamamlanana kadar bekler.
 *
 * `secim` verilmezse tüm pipeline çalışıyor demektir ve sipariş belge detayı
 * (5451) beklenir. Tek rapor çekiminde o raporun kendi id'si beklenir —
 * yoksa hiç çalışmayacak bir zinciri bekleyip zaman aşımına düşerdik.
 */
export async function waitForManualPipeline(
  startedAt: number,
  secim?: readonly (string | number)[] | null
): Promise<string> {
  const hedefId = beklenecekId(secim);
  const tekli = secim != null && secim.length === 1;
  const deadline = startedAt + DEADLINE_MS;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("cekildi_at,durum")
      .eq("report_id", hedefId)
      .eq("durum", "completed")
      .order("cekildi_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Sync durumu okunamadı: ${error.message}`);
    }
    const raw = data?.[0]?.cekildi_at;
    const at = raw ? Date.parse(String(raw)) : NaN;
    if (Number.isFinite(at) && at >= startedAt - 15_000) {
      return tekli
        ? "Rapor çekildi. Ekranlar az sonra güncellenir."
        : "Seçilen rapor zincirleri tamamlandı. Harita az sonra güncellenir.";
    }
    await sleep(POLL_MS);
  }
  throw new Error("Çekim zaman aşımına uğradı. n8n execution loguna bakın.");
}
