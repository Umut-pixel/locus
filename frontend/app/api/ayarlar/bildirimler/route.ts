import { NextResponse } from "next/server";

import { BILDIRIM_AYARLARI_TABLE, createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export type BildirimAyari = {
  anahtar: string;
  aktif: boolean;
  teslim_modu: "anlik" | "ozet";
  esik_deger: number | null;
  guncellenme_tarihi: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Ayarlar sayfasındaki gösterim sırası — sabah_raporu en başta, geri kalanı anlamlı kümeler halinde. */
const SIRA = [
  "sabah_raporu",
  "panorama_sync_hata",
  "ciro_degisim",
  "musteri_riskli",
  "borc_esigi",
  "yeni_siparis",
  "buyuk_siparis",
  "skt_yaklasan",
];

export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(BILDIRIM_AYARLARI_TABLE)
      .select("anahtar, aktif, teslim_modu, esik_deger, guncellenme_tarihi");
    if (error) throw new Error(error.message);

    const satirlar = (data ?? []) as BildirimAyari[];
    satirlar.sort((a, b) => SIRA.indexOf(a.anahtar) - SIRA.indexOf(b.anahtar));
    return NextResponse.json({ satirlar });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ayarlar okunamadı.";
    console.error("[api/ayarlar/bildirimler GET]", err);
    return jsonError(message, 500);
  }
}

export async function PATCH(request: Request) {
  let body: {
    anahtar?: unknown;
    aktif?: unknown;
    teslim_modu?: unknown;
    esik_deger?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Geçersiz JSON.", 400);
  }

  const anahtar = typeof body.anahtar === "string" ? body.anahtar : "";
  if (!anahtar) return jsonError("anahtar gerekli.", 400);

  const guncelleme: Record<string, unknown> = { guncellenme_tarihi: new Date().toISOString() };
  if (typeof body.aktif === "boolean") guncelleme.aktif = body.aktif;
  if (body.teslim_modu === "anlik" || body.teslim_modu === "ozet") {
    guncelleme.teslim_modu = body.teslim_modu;
  }
  if (body.esik_deger === null) {
    guncelleme.esik_deger = null;
  } else if (typeof body.esik_deger === "number" && Number.isFinite(body.esik_deger)) {
    guncelleme.esik_deger = body.esik_deger;
  }

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(BILDIRIM_AYARLARI_TABLE)
      .update(guncelleme)
      .eq("anahtar", anahtar)
      .select("anahtar, aktif, teslim_modu, esik_deger, guncellenme_tarihi")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ satir: data as BildirimAyari });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ayar güncellenemedi.";
    console.error("[api/ayarlar/bildirimler PATCH]", err);
    return jsonError(message, 500);
  }
}
