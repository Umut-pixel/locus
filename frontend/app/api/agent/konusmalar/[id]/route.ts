import { NextResponse } from "next/server";

import {
  AGENT_KONUSMA_MESAJLARI_TABLE,
  AGENT_KONUSMALAR_TABLE,
  createSupabaseAdmin,
} from "@/lib/supabase-admin";
import {
  konusmaBasligi,
  konusmaOzetFromRow,
  konusmaOzeti,
  type KonusmaRol,
} from "@/lib/agent-konusma";

export const runtime = "nodejs";

const HEAD_SELECT =
  "id,sira_no,baslik,ozet,mesaj_sayisi,guncelleme,sabitlendi";
const MSG_SELECT = "id,sira,rol,metin,alinti,olusturulma,model";
const ROLES = new Set<KonusmaRol>(["user", "assistant", "error"]);

type Ctx = { params: Promise<{ id: string }> };

function asMesaj(raw: Record<string, unknown>) {
  const id = raw.id != null ? String(raw.id) : "";
  const rol = raw.rol;
  if (!id || (rol !== "user" && rol !== "assistant" && rol !== "error")) {
    return null;
  }
  return {
    id,
    sira: Number(raw.sira ?? 0),
    rol,
    metin: typeof raw.metin === "string" ? raw.metin : "",
    alinti: typeof raw.alinti === "string" ? raw.alinti : null,
    olusturulma: typeof raw.olusturulma === "string" ? raw.olusturulma : null,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : null,
  };
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const head = await admin
      .from(AGENT_KONUSMALAR_TABLE)
      .select(HEAD_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (head.error) {
      return NextResponse.json({ error: head.error.message }, { status: 500 });
    }
    if (!head.data) {
      return NextResponse.json({ error: "Konuşma yok" }, { status: 404 });
    }

    const msgs = await admin
      .from(AGENT_KONUSMA_MESAJLARI_TABLE)
      .select(MSG_SELECT)
      .eq("konusma_id", id)
      .order("sira", { ascending: true });
    if (msgs.error) {
      return NextResponse.json({ error: msgs.error.message }, { status: 500 });
    }

    const mesajlar = [];
    for (const row of msgs.data ?? []) {
      const item = asMesaj(row as Record<string, unknown>);
      if (item) mesajlar.push(item);
    }
    return NextResponse.json({
      konusma: konusmaOzetFromRow(head.data as Record<string, unknown>),
      mesajlar,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST { mesajlar: [{id?, rol, metin, alinti?}], baslik?, ozet? }
 * Mesajları sona ekler; başlık/özet güncellenir.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawMsgs = Array.isArray(obj.mesajlar) ? obj.mesajlar : [];
  if (rawMsgs.length === 0) {
    return NextResponse.json({ error: "mesajlar boş" }, { status: 400 });
  }

  const incoming: {
    id?: string;
    rol: KonusmaRol;
    metin: string;
    alinti: string | null;
    model: string | null;
  }[] = [];
  for (const row of rawMsgs) {
    if (!row || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    const rol = m.rol;
    const metin = typeof m.metin === "string" ? m.metin.trim() : "";
    if (!ROLES.has(rol as KonusmaRol) || !metin) continue;
    const modelRaw = typeof m.model === "string" ? m.model.trim() : "";
    incoming.push({
      id: typeof m.id === "string" ? m.id : undefined,
      rol: rol as KonusmaRol,
      metin: metin.slice(0, 200000),
      alinti:
        typeof m.alinti === "string" && m.alinti.trim()
          ? m.alinti.trim().slice(0, 2000)
          : null,
      model: modelRaw ? modelRaw.slice(0, 80) : null,
    });
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: "geçerli mesaj yok" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const head = await admin
      .from(AGENT_KONUSMALAR_TABLE)
      .select("id,mesaj_sayisi,baslik,ozet")
      .eq("id", id)
      .maybeSingle();
    if (head.error) {
      return NextResponse.json({ error: head.error.message }, { status: 500 });
    }
    if (!head.data) {
      return NextResponse.json({ error: "Konuşma yok" }, { status: 404 });
    }

    const start = Number(head.data.mesaj_sayisi ?? 0);
    const rows = incoming.map((m, i) => ({
      ...(m.id ? { id: m.id } : {}),
      konusma_id: id,
      sira: start + i,
      rol: m.rol,
      metin: m.metin,
      alinti: m.alinti,
      model: m.model,
    }));

    const ins = await admin.from(AGENT_KONUSMA_MESAJLARI_TABLE).insert(rows);
    if (ins.error) {
      return NextResponse.json({ error: ins.error.message }, { status: 500 });
    }

    const patch: Record<string, unknown> = {
      mesaj_sayisi: start + incoming.length,
      guncelleme: new Date().toISOString(),
    };
    if (typeof obj.baslik === "string" && obj.baslik.trim()) {
      patch.baslik = konusmaBasligi(obj.baslik);
    } else if (start === 0 && incoming[0]?.rol === "user") {
      patch.baslik = konusmaBasligi(incoming[0].metin);
    }
    if (typeof obj.ozet === "string" && obj.ozet.trim()) {
      patch.ozet = konusmaOzeti(obj.ozet);
    } else if (start === 0 && incoming[0]?.rol === "user") {
      patch.ozet = konusmaOzeti(incoming[0].metin);
    }

    const upd = await admin
      .from(AGENT_KONUSMALAR_TABLE)
      .update(patch)
      .eq("id", id)
      .select(HEAD_SELECT)
      .single();
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }

    return NextResponse.json({
      konusma: konusmaOzetFromRow(upd.data as Record<string, unknown>),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH { sabitlendi: boolean } — başa sabitle / kaldır. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof obj.sabitlendi !== "boolean") {
    return NextResponse.json({ error: "sabitlendi gerekli" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const upd = await admin
      .from(AGENT_KONUSMALAR_TABLE)
      .update({ sabitlendi: obj.sabitlendi })
      .eq("id", id)
      .select(HEAD_SELECT)
      .maybeSingle();
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    if (!upd.data) {
      return NextResponse.json({ error: "Konuşma yok" }, { status: 404 });
    }
    return NextResponse.json({
      konusma: konusmaOzetFromRow(upd.data as Record<string, unknown>),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE — konuşma ve mesajları siler (cascade). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const del = await admin.from(AGENT_KONUSMALAR_TABLE).delete().eq("id", id);
    if (del.error) {
      return NextResponse.json({ error: del.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
