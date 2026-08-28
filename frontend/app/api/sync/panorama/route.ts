import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  corePanoramaSyncsAreFresh,
  isIndependentPanoramaReport,
  runPanoramaTransform,
} from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

type WebhookHint = {
  /** Supabase Database Webhook / pg_net trigger payload */
  fromWebhook: boolean;
  durum: string | null;
  reportId: number | null;
};

async function parseWebhookHint(request: Request): Promise<WebhookHint> {
  if (request.method !== "POST") {
    return { fromWebhook: false, durum: null, reportId: null };
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { fromWebhook: false, durum: null, reportId: null };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { fromWebhook: false, durum: null, reportId: null };
  }

  if (!body || typeof body !== "object") {
    return { fromWebhook: false, durum: null, reportId: null };
  }

  const obj = body as Record<string, unknown>;
  const record =
    obj.record && typeof obj.record === "object"
      ? (obj.record as Record<string, unknown>)
      : obj;

  const looksLikeWebhook =
    typeof obj.type === "string" ||
    typeof obj.table === "string" ||
    (typeof record.report_id === "number" && typeof record.durum === "string");

  if (!looksLikeWebhook) {
    return { fromWebhook: false, durum: null, reportId: null };
  }

  const durum =
    typeof record.durum === "string"
      ? record.durum
      : typeof obj.durum === "string"
        ? obj.durum
        : null;
  const rawId = record.report_id ?? obj.report_id;
  const reportId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string"
        ? Number(rawId)
        : null;

  return {
    fromWebhook: true,
    durum,
    reportId:
      reportId != null && !Number.isNaN(reportId) ? reportId : null,
  };
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return jsonError("Yetkisiz", 401);
  }

  const url = new URL(request.url);
  const force =
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("force") === "true";
  const skipGeocode =
    url.searchParams.get("skipGeocode") === "1" ||
    url.searchParams.get("skipGeocode") === "true";

  const webhook = await parseWebhookHint(request);

  // Webhook: completed olmayan UPDATE'leri yut (200 — retry fırtınası yok)
  if (
    webhook.fromWebhook &&
    webhook.durum != null &&
    webhook.durum !== "completed"
  ) {
    return NextResponse.json({
      skipped: true,
      reason: "durum_not_completed",
      reportId: webhook.reportId,
    });
  }

  try {
    const admin = createSupabaseAdmin();

    // 5450/5530/5230 bağımsız — kapıyı atla. 5451 sipariş landing-only.
    // force=1 her şeyi atlar.
    if (webhook.fromWebhook && webhook.reportId === 5451) {
      return NextResponse.json({
        skipped: true,
        reason: "landing_only_siparis_5450",
        reportId: webhook.reportId,
      });
    }

    const bypassFreshness =
      force || isIndependentPanoramaReport(webhook.reportId);

    if (!bypassFreshness) {
      const fresh = await corePanoramaSyncsAreFresh(admin);
      if (!fresh.ok) {
        return NextResponse.json({
          skipped: true,
          reason: fresh.reason,
          details: fresh.details ?? null,
          reportId: webhook.reportId,
        });
      }
    }

    const result = await runPanoramaTransform(admin, { force, skipGeocode });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    console.error("[api/sync/panorama]", err);
    return jsonError(message, 500);
  }
}

/** Manuel tetik / health. Cron kaldırıldı — asıl yol Database Webhook POST. */
export async function GET(request: Request) {
  return handle(request);
}

/** Supabase Database Webhook + manuel POST. */
export async function POST(request: Request) {
  return handle(request);
}
