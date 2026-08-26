import { NextResponse } from "next/server";

import { PANORAMA_SYNC_RUNS_TABLE } from "@/lib/sync/fetch-panorama";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const COOLDOWN_MS = 60 * 60 * 1000;
const IN_FLIGHT = ["running", "pending", "in_progress"] as const;
const REPORT_IDS = [5020, 5500, 5130, 5450, 5530, 5140, 5430] as const;
const HEADER_SECRET = "X-N8N-Sync-Secret";

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function POST() {
  const webhookUrl = process.env.N8N_PANORAMA_MANUAL_WEBHOOK_URL?.trim() ?? "";
  const webhookSecret =
    process.env.N8N_PANORAMA_MANUAL_WEBHOOK_SECRET?.trim() ?? "";

  if (!webhookUrl || !webhookSecret) {
    return jsonError("Manuel sync henüz yapılandırılmadı.", 503);
  }

  try {
    const admin = createSupabaseAdmin();

    const { data: inFlight, error: inFlightError } = await admin
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("id,durum,report_id")
      .in("durum", [...IN_FLIGHT])
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
      .in("report_id", [...REPORT_IDS])
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

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        [HEADER_SECRET]: webhookSecret,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error("[api/sync/panorama/manual] n8n", res.status);
      return jsonError("n8n tetiklenemedi.", 502);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    console.error("[api/sync/panorama/manual]", err);
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return jsonError("n8n yanıt vermedi.", 504);
    }
    return jsonError(message, 500);
  }
}
