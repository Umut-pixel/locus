import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { runPanoramaTransform } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Local / misconfigured — reject in production-like envs
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
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

  try {
    const admin = createSupabaseAdmin();
    const result = await runPanoramaTransform(admin, { force, skipGeocode });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    console.error("[api/sync/panorama]", err);
    return jsonError(message, 500);
  }
}

/** Vercel Cron GET; n8n / manuel POST. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
