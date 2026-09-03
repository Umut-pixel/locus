import { NextResponse } from "next/server";

import {
  PANORAMA_ZINCIRLERI,
  zincirleriCoz,
  type PanoramaZinciri,
} from "@/lib/panorama-raporlar";
import { PANORAMA_SYNC_RUNS_TABLE } from "@/lib/sync/fetch-panorama";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 2026-09-04: n8n'deki Wait dugumleri kaldirildi, "Hepsi" cekimi ~25 dk'dan
 * ~7-10 dk'ya dustu (bkz. backend/n8n/README.md). Cooldown de 60 dk'dan bu
 * yeni hiza gore kisaltildi -- eski deger Wait'li donemden kalmisti ve test/
 * tekrar deneme akisini gereksiz yere kilitliyordu.
 */
const COOLDOWN_MS = 10 * 60 * 1000;
/**
 * n8n zincirlerinde Create Sync Run ile Complete Sync Run arasinda hicbir
 * Wait node yok; olculen en uzun gercek pencere 108 sn (rapor 5450). Zincir
 * ortada coktugunde satir kalici olarak `running` kaliyor (n8n hicbir yerde
 * `failed` yazmiyor) ve butonu sonsuza kadar kilitliyordu. Bu esikten eski
 * satirlari kilit saymiyoruz; ayrica pg_cron'daki panorama_sync_stale_sweep
 * onlari `failed`a cekiyor (sql/panorama_sync_stale_sweep.sql).
 *
 * 15 dk: gercekci en uzun "Hepsi" cekiminden (~7-10 dk, Wait'siz) fazla
 * marj birakir, ama eski 30 dk'lik degerden cok daha hizli toparlanir.
 */
const STALE_LOCK_MS = 15 * 60 * 1000;
const IN_FLIGHT = ["running", "pending", "in_progress"] as const;
const HEADER_SECRET = "X-N8N-Sync-Secret";

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Cooldown yalnız İSTENEN zincirlerin id'lerine bakar.
 * Eskiden tüm rapor id'lerinin en yenisine bakıyordu; o hâliyle sabah
 * çekilmiş bir rapor yüzünden öğleden sonra tek bir raporu tazelemek
 * imkânsızdı (429).
 */
function ilgiliReportIdleri(zincirler: readonly PanoramaZinciri[]): number[] {
  const idler = new Set<number>();
  for (const z of zincirler) {
    idler.add(z.reportId);
    idler.add(z.bekleId);
  }
  // Müşteri zinciri üç raporu birlikte çeker; ikisi kayıt defterinde yok.
  if (zincirler.some((z) => z.anahtar === "musteri")) {
    idler.add(5500);
  }
  return [...idler];
}

export async function POST(request: Request) {
  // Gövde isteğe bağlı: boş POST = eskisi gibi bütün zincirler.
  let ham: { reportIds?: unknown; raporlar?: unknown; listele?: unknown } = {};
  try {
    const metin = await request.text();
    if (metin.trim()) ham = JSON.parse(metin);
  } catch {
    return jsonError("Geçersiz JSON.", 400);
  }

  // { listele: true } hiçbir şey tetiklemez — kayıt defterini döndürür.
  // Asistanın rapor adlarını uydurmaması için tek doğru kaynak burası.
  if (ham.listele === true) {
    return NextResponse.json({
      zincirler: PANORAMA_ZINCIRLERI.map((z) => ({
        anahtar: z.anahtar,
        ad: z.ad,
        aciklama: z.aciklama,
        tahminiSn: z.tahminiSn,
      })),
    });
  }

  const webhookUrl = process.env.N8N_PANORAMA_MANUAL_WEBHOOK_URL?.trim() ?? "";
  const webhookSecret =
    process.env.N8N_PANORAMA_MANUAL_WEBHOOK_SECRET?.trim() ?? "";

  if (!webhookUrl || !webhookSecret) {
    return jsonError("Manuel sync henüz yapılandırılmadı.", 503);
  }

  if (/\/webhook-test\//i.test(webhookUrl)) {
    return jsonError(
      "Test webhook URL’si kullanılıyor. n8n’de Production URL kopyala (Listen kapalıyken test 404 verir).",
      400
    );
  }

  const secim: unknown = ham.reportIds ?? ham.raporlar ?? null;

  let zincirler: PanoramaZinciri[] = [...PANORAMA_ZINCIRLERI];
  if (Array.isArray(secim)) {
    const cozum = zincirleriCoz(
      secim.filter(
        (v): v is string | number =>
          typeof v === "string" || typeof v === "number"
      )
    );
    if (cozum.bilinmeyen.length > 0) {
      return jsonError(
        `Tanınmayan rapor: ${cozum.bilinmeyen.join(", ")}. Geçerli değerler: ${PANORAMA_ZINCIRLERI.map((z) => z.anahtar).join(", ")}.`,
        400
      );
    }
    if (cozum.zincirler.length === 0) {
      return jsonError("Çekilecek rapor seçilmedi.", 400);
    }
    zincirler = cozum.zincirler;
  }

  const tumu = zincirler.length === PANORAMA_ZINCIRLERI.length;

  try {
    const admin = createSupabaseAdmin();

    const { data: inFlight, error: inFlightError } = await admin
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("id,durum,report_id")
      .in("durum", [...IN_FLIGHT])
      .gte("cekildi_at", new Date(Date.now() - STALE_LOCK_MS).toISOString())
      .limit(1);

    if (inFlightError) {
      throw new Error(`sync_runs okunamadı: ${inFlightError.message}`);
    }
    if (inFlight && inFlight.length > 0) {
      return jsonError("Bir sync zaten çalışıyor. Bitmesini bekleyin.", 409);
    }

    const { data: latest, error: latestError } = await admin
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("cekildi_at")
      .in("report_id", ilgiliReportIdleri(zincirler))
      .not("cekildi_at", "is", null)
      .order("cekildi_at", { ascending: false })
      .limit(1);

    if (latestError) {
      throw new Error(`son sync okunamadı: ${latestError.message}`);
    }

    const lastAt = latest?.[0]?.cekildi_at
      ? Date.parse(String(latest[0].cekildi_at))
      : NaN;
    if (Number.isFinite(lastAt)) {
      const elapsed = Date.now() - lastAt;
      if (elapsed < COOLDOWN_MS) {
        const retryAfterSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        return NextResponse.json(
          {
            error: "Son çekimden bu yana 60 dakika dolmadı.",
            retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSec) },
          }
        );
      }
    }

    const n8nHeaders: Record<string, string> = {
      [HEADER_SECRET]: webhookSecret,
      Authorization: `Bearer ${webhookSecret}`,
      Accept: "application/json",
    };
    const signal = AbortSignal.timeout(15_000);

    // n8n Guard düğümü boş listeyi "hepsi" olarak okur — eski davranışla
    // birebir aynı kalsın diye tam seçimde de boş gönderiyoruz.
    const reportIds = tumu ? [] : zincirler.map((z) => z.reportId);

    let res = await fetch(webhookUrl, {
      method: "POST",
      headers: { ...n8nHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "locus-manual", reportIds }),
      signal,
    });

    if (res.status === 404) {
      const preview = (await res.text().catch(() => "")).slice(0, 280);
      if (/not registered for POST|GET request/i.test(preview)) {
        // GET yedeği gövde taşıyamaz; seçim query string'e geçer, Guard
        // düğümü oradan da okur.
        const yedekUrl = new URL(webhookUrl);
        if (reportIds.length > 0) {
          yedekUrl.searchParams.set("reportIds", reportIds.join(","));
        }
        res = await fetch(yedekUrl, {
          method: "GET",
          headers: n8nHeaders,
          signal,
        });
      } else {
        console.error("[api/sync/panorama/manual] n8n", 404, preview);
        return jsonError(
          "n8n webhook bulunamadı. Production URL ve workflow’un aktif olduğunu kontrol et.",
          502
        );
      }
    }

    if (!res.ok) {
      const preview = (await res.text().catch(() => "")).slice(0, 280);
      console.error("[api/sync/panorama/manual] n8n", res.status, preview);
      if (res.status === 404) {
        return jsonError(
          "n8n webhook hâlâ GET kayıtlı. Authentication=None ve Method=POST yapıp workflow’u kapatıp aç.",
          502
        );
      }
      if (res.status === 401 || res.status === 403) {
        return jsonError(
          "n8n Header Auth reddetti. Webhook Authentication = None olmalı; sır Guard node’da X-N8N-Sync-Secret ile kontrol edilir.",
          502
        );
      }
      return jsonError(`n8n tetiklenemedi (HTTP ${res.status}).`, 502);
    }

    return NextResponse.json({
      ok: true,
      tumu,
      zincirler: zincirler.map((z) => ({
        anahtar: z.anahtar,
        ad: z.ad,
        bekleId: z.bekleId,
      })),
      /** İlerleme takibi bunun tamamlanmasını bekler (kaskadın sonu). */
      bekleId: zincirler[zincirler.length - 1]?.bekleId ?? null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    console.error("[api/sync/panorama/manual]", err);
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      return jsonError("n8n yanıt vermedi.", 504);
    }
    return jsonError(message, 500);
  }
}
