import {
  PANORAMA_ZINCIRLERI,
  tahminiSureMs,
  ZINCIR_ARASI_BEKLEME_SN,
  zincirleriCoz,
} from "@/lib/panorama-raporlar";
import { formatIstanbulStamp } from "@/lib/panorama-schedule";
import { PANORAMA_SYNC_RUNS_TABLE, supabase } from "@/lib/supabase";

export const MANUAL_SYNC_STORAGE_KEY = "locus:panorama-manual-sync-at";
/**
 * `/api/sync/panorama/manual`'daki COOLDOWN_MS ile aynı olmalı.
 * 2026-09-04: n8n Wait düğümleri kaldırıldı, çekim ~25 dk'dan ~7-10 dk'ya
 * düştü; eski 60 dk'lık cooldown bu hıza göre kısaltıldı.
 */
export const MANUAL_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

/** Son manuel çekim damgası — cooldown sayacı bunu okur. */
export function writeManualSyncAt(at: number) {
  try {
    window.localStorage.setItem(MANUAL_SYNC_STORAGE_KEY, String(at));
  } catch {
    /* private mode */
  }
}

/**
 * Zincirler arası bekleme — 2026-09-04'te n8n'deki Wait düğümleriyle
 * birlikte KALDIRILDI, `ZINCIR_ARASI_BEKLEME_SN` (0) ile aynı olmalı.
 * İsim geriye dönük uyum için korunuyor; yeni kod `ZINCIR_ARASI_BEKLEME_SN`
 * kullansın.
 */
export const MANUAL_CHAIN_WAIT_SEC = ZINCIR_ARASI_BEKLEME_SN;

/**
 * Tüm zincirler seçiliyken tahmini süre.
 * Sabit "zincir başına 180 sn" varsayımı yerine kayıt defterindeki ölçülmüş
 * süreler kullanılıyor — 5450 ~2 dk iken stok ~35 sn, ortalama almak
 * bitiş damgasını şişiriyordu.
 */
export const MANUAL_ESTIMATE_MS = tahminiSureMs(PANORAMA_ZINCIRLERI);

const POLL_MS = 15_000;
/**
 * 2026-09-04: Wait düğümleri kaldırıldıktan sonra gerçekçi en uzun çekim
 * ~7-10 dk (bkz. MANUAL_ESTIMATE_MS). 90 dk'lık eski üst sınır, gerçek bir
 * sorun olduğunda kullanıcıyı gereksiz yere uzun süre "yükleniyor"da
 * bekletiyordu; 20 dk bolca marj bırakıp daha hızlı hata verir.
 */
const DEADLINE_MS = 20 * 60 * 1000;

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
  return `Tahmini bitiş: ${manualSyncEtaStamp(from, secim)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ZincirDurumu = "bekliyor" | "calisiyor" | "bitti" | "hata";

export interface ZincirIlerlemesi {
  anahtar: string;
  ad: string;
  durum: ZincirDurumu;
  satirSayisi: number | null;
  hata: string | null;
}

/**
 * Seçilen zincirleri TEK TEK izler ve her turda ilerlemeyi bildirir.
 *
 * `waitForManualPipeline` yalnız kaskadın sonuna bakıyor; kart içinde
 * "hangisi çekiliyor" göstermek için zincir bazında duruma ihtiyaç var.
 * Tek sorguyla bu çekimden sonraki tüm satırlar okunur — zincir başına
 * ayrı istek atmak 7 katı trafik demekti.
 */
export async function izleRaporCekimi(
  startedAt: number,
  secim: readonly (string | number)[] | null | undefined,
  onIlerleme: (adimlar: ZincirIlerlemesi[]) => void
): Promise<ZincirIlerlemesi[]> {
  const { zincirler } = zincirleriCoz(secim ?? null);
  const idler = zincirler.map((z) => z.bekleId);
  const deadline = startedAt + DEADLINE_MS;

  const kur = (): ZincirIlerlemesi[] =>
    zincirler.map((z) => ({
      anahtar: z.anahtar,
      ad: z.ad,
      durum: "bekliyor" as ZincirDurumu,
      satirSayisi: null,
      hata: null,
    }));

  let adimlar = kur();
  onIlerleme(adimlar);

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("report_id,durum,satir_sayisi,hata,cekildi_at")
      // 15 sn tolerans: n8n satırı tetikten hemen önce açmış olabilir.
      .gte("cekildi_at", new Date(startedAt - 15_000).toISOString())
      .in("report_id", idler)
      .order("cekildi_at", { ascending: false });

    if (error) {
      throw new Error(`Sync durumu okunamadı: ${error.message}`);
    }

    const sonraki = kur();
    for (const satir of data ?? []) {
      const z = zincirler.find((x) => x.bekleId === Number(satir.report_id));
      if (!z) continue;
      const hedef = sonraki.find((s) => s.anahtar === z.anahtar);
      if (!hedef || hedef.durum === "bitti") continue;
      const d = String(satir.durum ?? "");
      if (d === "completed") {
        hedef.durum = "bitti";
        hedef.satirSayisi =
          satir.satir_sayisi == null ? null : Number(satir.satir_sayisi);
      } else if (d === "failed") {
        hedef.durum = "hata";
        hedef.hata = satir.hata ? String(satir.hata) : "Çekim başarısız.";
      } else {
        hedef.durum = "calisiyor";
      }
    }

    adimlar = sonraki;
    onIlerleme(adimlar);

    if (adimlar.every((a) => a.durum === "bitti" || a.durum === "hata")) {
      return adimlar;
    }
    await sleep(POLL_MS);
  }

  throw new Error("Çekim zaman aşımına uğradı. n8n execution loguna bakın.");
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
