import { NextResponse } from "next/server";

import {
  createSupabaseAdmin,
  MUSTERI_FAVORILER_LISTE_VIEW,
  MUSTERI_FAVORILER_TABLE,
  MUSTERILER_TABLE,
} from "@/lib/supabase-admin";
import type { MusteriFavori, RiskDurumu } from "@/lib/types";

export const runtime = "nodejs";

const LIST_SELECT =
  "favori_id,not_metni,olusturulma,musteri_kodu,unvan,adres,sehir,ilce,lat,lon,risk_durumu";

const RISK_SET = new Set<RiskDurumu>([
  "saglikli",
  "izlenmeli",
  "riskli",
  "hic_teslimat_yok",
]);

function asFavori(raw: Record<string, unknown>): MusteriFavori | null {
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const kod =
    raw.musteri_kodu != null ? String(raw.musteri_kodu).trim() : "";
  const favoriId = raw.favori_id != null ? String(raw.favori_id) : "";
  if (!kod || !favoriId) return null;
  const riskRaw = raw.risk_durumu != null ? String(raw.risk_durumu) : null;
  const risk =
    riskRaw && RISK_SET.has(riskRaw as RiskDurumu)
      ? (riskRaw as RiskDurumu)
      : null;
  return {
    favori_id: favoriId,
    not_metni: (raw.not_metni as string | null) ?? null,
    olusturulma: String(raw.olusturulma ?? ""),
    musteri_kodu: kod,
    unvan: String(raw.unvan ?? kod),
    adres: (raw.adres as string | null) ?? null,
    sehir: (raw.sehir as string | null) ?? null,
    ilce: (raw.ilce as string | null) ?? null,
    lat,
    lon,
    risk_durumu: risk,
  };
}

/** GET — ortak müşteri "sonra bak" listesi. */
export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(MUSTERI_FAVORILER_LISTE_VIEW)
      .select(LIST_SELECT)
      .order("olusturulma", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items: MusteriFavori[] = [];
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
 * POST { musteri_kodu: string, action?: "toggle" | "note", not_metni?: string | null }
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
  const kod =
    obj && typeof obj.musteri_kodu === "string"
      ? obj.musteri_kodu.trim()
      : "";
  const action =
    obj && obj.action === "note" ? "note" : ("toggle" as "toggle" | "note");
  const hasNotMetni = obj != null && "not_metni" in obj;
  const notMetniRaw = hasNotMetni ? obj.not_metni : undefined;
  const notMetni =
    notMetniRaw == null
      ? null
      : typeof notMetniRaw === "string"
        ? notMetniRaw.trim().slice(0, 280) || null
        : null;

  if (!kod) {
    return NextResponse.json(
      { error: "musteri_kodu gerekli" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdmin();

    if (action === "note") {
      const { data, error } = await admin
        .from(MUSTERI_FAVORILER_TABLE)
        .update({ not_metni: notMetni })
        .eq("musteri_kodu", kod)
        .select("id, musteri_kodu, not_metni")
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
        musteri_kodu: data.musteri_kodu,
        not_metni: data.not_metni ?? null,
      });
    }

    const existing = await admin
      .from(MUSTERI_FAVORILER_TABLE)
      .select("id")
      .eq("musteri_kodu", kod)
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json(
        { error: existing.error.message },
        { status: 500 }
      );
    }

    if (existing.data) {
      const { error } = await admin
        .from(MUSTERI_FAVORILER_TABLE)
        .delete()
        .eq("musteri_kodu", kod);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, favori: false, musteri_kodu: kod });
    }

    const check = await admin
      .from(MUSTERILER_TABLE)
      .select("musteri_kodu")
      .eq("musteri_kodu", kod)
      .maybeSingle();

    if (check.error) {
      return NextResponse.json({ error: check.error.message }, { status: 500 });
    }
    if (!check.data) {
      return NextResponse.json(
        { error: "Müşteri bulunamadı" },
        { status: 404 }
      );
    }

    const insert = await admin
      .from(MUSTERI_FAVORILER_TABLE)
      .insert({
        musteri_kodu: kod,
        not_metni: hasNotMetni ? notMetni : null,
      })
      .select("id, musteri_kodu, not_metni")
      .single();

    if (insert.error) {
      return NextResponse.json({ error: insert.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      favori: true,
      musteri_kodu: insert.data.musteri_kodu,
      not_metni: insert.data.not_metni ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
