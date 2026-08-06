import { NextResponse } from "next/server";

import {
  listMusteriGizlenen,
  toggleMusteriGizle,
} from "@/lib/gizle-store";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/** GET — ortak gizlenen müşteri listesi. */
export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const items = await listMusteriGizlenen(admin);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST { musteri_kodu: string } — gizle / göster toggle. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const kod =
    obj && typeof obj.musteri_kodu === "string"
      ? obj.musteri_kodu.trim()
      : "";

  if (!kod) {
    return NextResponse.json(
      { error: "musteri_kodu gerekli" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdmin();
    const result = await toggleMusteriGizle(admin, kod);
    return NextResponse.json({
      ok: true,
      gizle: result.gizle,
      musteri_kodu: kod,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    const status = message.includes("bulunamadı") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
