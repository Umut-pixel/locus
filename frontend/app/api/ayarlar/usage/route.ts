import { NextResponse } from "next/server";

import { loadUsageOzet, type UsageGunAraligi } from "@/lib/anthropic-usage";

export const runtime = "nodejs";
export const maxDuration = 30;

function daysFrom(url: URL): UsageGunAraligi {
  return url.searchParams.get("days") === "31" ? 31 : 7;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = await loadUsageOzet(daysFrom(url), {
    fresh: url.searchParams.get("fresh") === "1",
  });
  const status = payload.ok ? 200 : payload.configured ? 502 : 503;
  return NextResponse.json(payload, { status });
}
