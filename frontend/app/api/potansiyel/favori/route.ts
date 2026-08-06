import { NextResponse } from "next/server";

import {
  createSupabaseAdmin,
  POTANSIYEL_FAVORILER_LISTE_VIEW,
  POTANSIYEL_FAVORILER_TABLE,
  POTANSIYEL_MUSTERILER_TABLE,
} from "@/lib/supabase-admin";
import type { PotansiyelFavori } from "@/lib/types";

export const runtime = "nodejs";

const LIST_SELECT =
  "favori_id,not_metni,olusturulma,id,kaynak_id,isim,adres,il,ilce,lat,lon,primary_type,google_types,kalite_bayragi,tarandigi_tarih";

function asStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v)).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function asFavori(raw: Record<string, unknown>): PotansiyelFavori | null {
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const id = raw.id != null ? String(raw.id) : "";
  const favoriId = raw.favori_id != null ? String(raw.favori_id) : "";
  if (!id || !favoriId) return null;
  return {
    favori_id: favoriId,
    not_metni: (raw.not_metni as string | null) ?? null,
    olusturulma: String(raw.olusturulma ?? ""),
    id,
    kaynak_id: (raw.kaynak_id as string | null) ?? null,
    isim: (raw.isim as string | null) ?? null,
    adres: (raw.adres as string | null) ?? null,
    il: (raw.il as string | null) ?? null,
    ilce: (raw.ilce as string | null) ?? null,
    lat,
    lon,
    primary_type: (raw.primary_type as string | null) ?? null,
    google_types: asStringArray(raw.google_types),
    kalite_bayragi: (raw.kalite_bayragi as string | null) ?? null,
    tarandigi_tarih: (raw.tarandigi_tarih as string | null) ?? null,
  };
}

/** GET — ortak "sonra bak" listesi (yalnızca hâlâ yeni potansiyeller). */
export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(POTANSIYEL_FAVORILER_LISTE_VIEW)
      .select(LIST_SELECT)
      .order("olusturulma", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items: PotansiyelFavori[] = [];
    for (const row of data ?? []) {
      const item = asFavori(row as Record<string, unknown>);
      if (item) items.push(item);
    }

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST { id: string, action?: "toggle" | "note", not_metni?: string | null }
 * - toggle (varsayılan): yoksa ekle, varsa kaldır
 * - note: mevcut favorinin notunu güncelle (yoksa 404)
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
  const id =
    obj && typeof obj.id === "string" ? obj.id.trim() : "";
  const action =
    obj && obj.action === "note"
      ? "note"
      : ("toggle" as "toggle" | "note");
  const hasNotMetni = obj != null && "not_metni" in obj;
  const notMetniRaw = hasNotMetni ? obj.not_metni : undefined;
  const notMetni =
    notMetniRaw == null
      ? null
      : typeof notMetniRaw === "string"
        ? notMetniRaw.trim().slice(0, 280) || null
        : null;

  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();

    if (action === "note") {
      const { data, error } = await admin
        .from(POTANSIYEL_FAVORILER_TABLE)
        .update({ not_metni: notMetni })
        .eq("potansiyel_id", id)
        .select("id, potansiyel_id, not_metni")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json(
          { error: "Favori bulunamadı" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        favori: true,
        id: data.potansiyel_id,
        not_metni: data.not_metni ?? null,
      });
    }

    const existing = await admin
      .from(POTANSIYEL_FAVORILER_TABLE)
      .select("id")
      .eq("potansiyel_id", id)
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json(
        { error: existing.error.message },
        { status: 500 }
      );
    }

    if (existing.data) {
      const { error } = await admin
        .from(POTANSIYEL_FAVORILER_TABLE)
        .delete()
        .eq("potansiyel_id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, favori: false, id });
    }

    // Yalnızca hâlâ "yeni" potansiyeller favorilenebilir.
    const check = await admin
      .from(POTANSIYEL_MUSTERILER_TABLE)
      .select("id")
      .eq("id", id)
      .eq("eslesme_durumu", "yeni")
      .maybeSingle();

    if (check.error) {
      return NextResponse.json({ error: check.error.message }, { status: 500 });
    }
    if (!check.data) {
      return NextResponse.json(
        { error: "Kayıt bulunamadı veya favorilenemez" },
        { status: 404 }
      );
    }

    const insert = await admin
      .from(POTANSIYEL_FAVORILER_TABLE)
      .insert({
        potansiyel_id: id,
        not_metni: hasNotMetni ? notMetni : null,
      })
      .select("id, potansiyel_id, not_metni")
      .single();

    if (insert.error) {
      return NextResponse.json({ error: insert.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      favori: true,
      id: insert.data.potansiyel_id,
      not_metni: insert.data.not_metni ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
