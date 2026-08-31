import { NextResponse } from "next/server";

import {
  AGENT_KONUSMALAR_TABLE,
  createSupabaseAdmin,
} from "@/lib/supabase-admin";
import { konusmaBasligi, konusmaOzetFromRow } from "@/lib/agent-konusma";

export const runtime = "nodejs";

const LIST_SELECT =
  "id,sira_no,baslik,ozet,mesaj_sayisi,guncelleme,sabitlendi";

/** GET — sabitlenenler önde, sonra yeniden eskiye. */
export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(AGENT_KONUSMALAR_TABLE)
      .select(LIST_SELECT)
      .order("sabitlendi", { ascending: false })
      .order("guncelleme", { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = [];
    for (const row of data ?? []) {
      const item = konusmaOzetFromRow(row as Record<string, unknown>);
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
    const item = konusmaOzetFromRow(data as Record<string, unknown>);
    return NextResponse.json({ konusma: item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
