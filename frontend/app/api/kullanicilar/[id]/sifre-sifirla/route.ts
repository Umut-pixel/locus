import { NextResponse } from "next/server";

import { oturumIzinKontrol } from "@/lib/api-auth";
import { gucluGeciciSifre } from "@/lib/kullanici-provisioning";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST — yeni geçici şifre üretir, bir kez döner (hiçbir yere yazılmaz). */
export async function POST(_request: Request, context: Ctx) {
  const oturum = await oturumIzinKontrol("kullanici_yonetimi");
  if (!oturum) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Geçersiz kullanıcı" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const gecici = gucluGeciciSifre();

  const { error } = await admin.auth.admin.updateUserById(id, {
    password: gecici,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, geciciSifre: gecici });
}
