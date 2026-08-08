import { NextResponse } from "next/server";

import {
  createSupabaseAdmin,
  ENTITY_NOTLAR_TABLE,
  MUSTERILER_TABLE,
  POTANSIYEL_MUSTERILER_TABLE,
} from "@/lib/supabase-admin";
import type { EntityNot, EntityNotKind } from "@/lib/types";

export const runtime = "nodejs";

const MAX_LEN = 2000;
const LIST_SELECT =
  "id,entity_kind,musteri_kodu,potansiyel_id,metin,olusturulma,guncelleme";

function asNot(raw: Record<string, unknown>): EntityNot | null {
  const id = raw.id != null ? String(raw.id) : "";
  const kind = raw.entity_kind;
  if (!id || (kind !== "musteri" && kind !== "potansiyel")) return null;
  const metin = typeof raw.metin === "string" ? raw.metin : "";
  if (!metin.trim()) return null;
  return {
    id,
    entity_kind: kind,
    musteri_kodu:
      raw.musteri_kodu != null ? String(raw.musteri_kodu) : null,
    potansiyel_id:
      raw.potansiyel_id != null ? String(raw.potansiyel_id) : null,
    metin,
    olusturulma: String(raw.olusturulma ?? ""),
    guncelleme: String(raw.guncelleme ?? ""),
  };
}

function parseKind(v: unknown): EntityNotKind | null {
  return v === "musteri" || v === "potansiyel" ? v : null;
}

/** GET ?entity_kind=&musteri_kodu= | potansiyel_id= */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("entity_kind"));
  const musteriKodu = (url.searchParams.get("musteri_kodu") ?? "").trim();
  const potansiyelId = (url.searchParams.get("potansiyel_id") ?? "").trim();

  if (!kind) {
    return NextResponse.json(
      { error: "entity_kind gerekli (musteri|potansiyel)" },
      { status: 400 }
    );
  }
  if (kind === "musteri" && !musteriKodu) {
    return NextResponse.json(
      { error: "musteri_kodu gerekli" },
      { status: 400 }
    );
  }
  if (kind === "potansiyel" && !potansiyelId) {
    return NextResponse.json(
      { error: "potansiyel_id gerekli" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdmin();
    let q = admin
      .from(ENTITY_NOTLAR_TABLE)
      .select(LIST_SELECT)
      .eq("entity_kind", kind)
      .order("olusturulma", { ascending: false })
      .limit(50);

    q =
      kind === "musteri"
        ? q.eq("musteri_kodu", musteriKodu)
        : q.eq("potansiyel_id", potansiyelId);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items: EntityNot[] = [];
    for (const row of data ?? []) {
      const item = asNot(row as Record<string, unknown>);
      if (item) items.push(item);
    }
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST
 * { action: "create", entity_kind, musteri_kodu? | potansiyel_id?, metin }
 * { action: "delete", id }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const action =
    obj?.action === "delete"
      ? "delete"
      : obj?.action === "create"
        ? "create"
        : null;

  if (!action) {
    return NextResponse.json(
      { error: "action gerekli (create|delete)" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdmin();

    if (action === "delete") {
      const id = typeof obj?.id === "string" ? obj.id.trim() : "";
      if (!id) {
        return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      }
      const { error } = await admin
        .from(ENTITY_NOTLAR_TABLE)
        .delete()
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, id });
    }

    const kind = parseKind(obj?.entity_kind);
    const metinRaw = typeof obj?.metin === "string" ? obj.metin : "";
    const metin = metinRaw.trim().slice(0, MAX_LEN);
    const musteriKodu =
      typeof obj?.musteri_kodu === "string" ? obj.musteri_kodu.trim() : "";
    const potansiyelId =
      typeof obj?.potansiyel_id === "string" ? obj.potansiyel_id.trim() : "";

    if (!kind) {
      return NextResponse.json(
        { error: "entity_kind gerekli" },
        { status: 400 }
      );
    }
    if (!metin) {
      return NextResponse.json(
        { error: "metin boş olamaz" },
        { status: 400 }
      );
    }

    if (kind === "musteri") {
      if (!musteriKodu) {
        return NextResponse.json(
          { error: "musteri_kodu gerekli" },
          { status: 400 }
        );
      }
      const check = await admin
        .from(MUSTERILER_TABLE)
        .select("musteri_kodu")
        .eq("musteri_kodu", musteriKodu)
        .maybeSingle();
      if (check.error) {
        return NextResponse.json(
          { error: check.error.message },
          { status: 500 }
        );
      }
      if (!check.data) {
        return NextResponse.json(
          { error: "Müşteri bulunamadı" },
          { status: 404 }
        );
      }

      const insert = await admin
        .from(ENTITY_NOTLAR_TABLE)
        .insert({
          entity_kind: "musteri",
          musteri_kodu: musteriKodu,
          potansiyel_id: null,
          metin,
        })
        .select(LIST_SELECT)
        .single();

      if (insert.error) {
        return NextResponse.json(
          { error: insert.error.message },
          { status: 500 }
        );
      }
      const item = asNot(insert.data as Record<string, unknown>);
      return NextResponse.json({ ok: true, item });
    }

    if (!potansiyelId) {
      return NextResponse.json(
        { error: "potansiyel_id gerekli" },
        { status: 400 }
      );
    }
    const check = await admin
      .from(POTANSIYEL_MUSTERILER_TABLE)
      .select("id")
      .eq("id", potansiyelId)
      .maybeSingle();
    if (check.error) {
      return NextResponse.json(
        { error: check.error.message },
        { status: 500 }
      );
    }
    if (!check.data) {
      return NextResponse.json(
        { error: "Potansiyel bulunamadı" },
        { status: 404 }
      );
    }

    const insert = await admin
      .from(ENTITY_NOTLAR_TABLE)
      .insert({
        entity_kind: "potansiyel",
        musteri_kodu: null,
        potansiyel_id: potansiyelId,
        metin,
      })
      .select(LIST_SELECT)
      .single();

    if (insert.error) {
      return NextResponse.json(
        { error: insert.error.message },
        { status: 500 }
      );
    }
    const item = asNot(insert.data as Record<string, unknown>);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
