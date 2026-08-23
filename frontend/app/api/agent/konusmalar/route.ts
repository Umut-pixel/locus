import { NextResponse } from "next/server";

import {
  AGENT_KONUSMALAR_TABLE,
  createSupabaseAdmin,
} from "@/lib/supabase-admin";
import { konusmaBasligi } from "@/lib/agent-konusma";

export const runtime = "nodejs";

const LIST_SELECT = "id,baslik,ozet,mesaj_sayisi,guncelleme";

function asOzet(raw: Record<string, unknown>) {
  const id = raw.id != null ? String(raw.id) : "";
  if (!id) return null;
  return {
    id,
    baslik: typeof raw.baslik === "string" ? raw.baslik : "Yeni konuşma",
    ozet: typeof raw.ozet === "string" ? raw.ozet : null,
    mesajSayisi: Number(raw.mesaj_sayisi ?? 0),
    guncelleme: String(raw.guncelleme ?? ""),
  };
}

/** GET — yeniden eskiye konuşma listesi. */
export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(AGENT_KONUSMALAR_TABLE)
      .select(LIST_SELECT)
      .order("guncelleme", { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = [];
    for (const row of data ?? []) {
      const item = asOzet(row as Record<string, unknown>);
      if (item) items.push(item);
    }
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST { baslik?, ozet? } — yeni boş konuşma. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const baslik = konusmaBasligi(
    typeof obj.baslik === "string" ? obj.baslik : "Yeni konuşma"
  );
  const ozet =
    typeof obj.ozet === "string" && obj.ozet.trim()
      ? obj.ozet.trim().slice(0, 2000)
      : null;

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(AGENT_KONUSMALAR_TABLE)
      .insert({ baslik, ozet })
      .select(LIST_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Konuşma oluşturulamadı" },
        { status: 500 }
      );
    }
    const item = asOzet(data as Record<string, unknown>);
    return NextResponse.json({ konusma: item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
