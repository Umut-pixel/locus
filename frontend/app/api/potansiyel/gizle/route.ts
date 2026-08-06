import { NextResponse } from "next/server";

import {
  listPotansiyelGizlenen,
  togglePotansiyelGizle,
} from "@/lib/gizle-store";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/** GET — ortak gizlenen potansiyel listesi. */
export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const items = await listPotansiyelGizlenen(admin);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST { id: string } — gizle / göster toggle. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const id =
    body &&
    typeof body === "object" &&
    "id" in body &&
    typeof (body as { id: unknown }).id === "string"
      ? (body as { id: string }).id.trim()
      : "";

  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const result = await togglePotansiyelGizle(admin, id);
    return NextResponse.json({ ok: true, gizle: result.gizle, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    const status = message.includes("bulunamadı") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
