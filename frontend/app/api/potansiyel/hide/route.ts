import { NextResponse } from "next/server";

import {
  createSupabaseAdmin,
  POTANSIYEL_MUSTERILER_TABLE,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

/** Yanlış / alakasız aday — harita view'ından düşer (`potansiyel_musteri` yalnızca `yeni`). */
const ESLESME_GIZLI = "gizli";

/**
 * POST { id: string }
 * `eslesme_durumu = 'gizli'` — manuel gizleme; n8n upsert bu alanı ezmez.
 */
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
    const { data, error } = await admin
      .from(POTANSIYEL_MUSTERILER_TABLE)
      .update({ eslesme_durumu: ESLESME_GIZLI })
      .eq("id", id)
      .eq("eslesme_durumu", "yeni")
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Kayıt bulunamadı veya zaten gizli" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
