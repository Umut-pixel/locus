import { NextResponse } from "next/server";

import { oturumIzinKontrol } from "@/lib/api-auth";
import { rolBilgisiGetir } from "@/lib/kullanici-provisioning";
import { createSupabaseAdmin, KULLANICILAR_TABLE } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

interface PatchBody {
  rolKod?: unknown;
  aktif?: unknown;
}

/** PATCH { rolKod?, aktif? } — rol değiştir ve/veya pasifleştir/aktifleştir. */
export async function PATCH(request: Request, context: Ctx) {
  const oturum = await oturumIzinKontrol("kullanici_yonetimi");
  if (!oturum) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Geçersiz kullanıcı" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const rolKod = typeof body.rolKod === "string" ? body.rolKod.trim() : null;
  const aktif = typeof body.aktif === "boolean" ? body.aktif : null;

  if (rolKod == null && aktif == null) {
    return NextResponse.json(
      { error: "rolKod veya aktif gerekli" },
      { status: 400 }
    );
  }

  // Admin'in kendi hesabını yanlışlıkla pasifleştirip kilitlenmesini önle —
  // herhangi bir yazımdan ÖNCE reddet.
  if (aktif === false && id === oturum.id) {
    return NextResponse.json(
      { error: "Kendi hesabınızı pasifleştiremezsiniz" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdmin();

  const { data: authUser, error: authFetchError } =
    await admin.auth.admin.getUserById(id);
  if (authFetchError || !authUser.user) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }
  const mevcutAppMeta = (authUser.user.app_metadata ?? {}) as Record<
    string,
    unknown
  >;

  const patch: Record<string, unknown> = {};
  const appMeta = { ...mevcutAppMeta };

  if (rolKod != null) {
    const rol = await rolBilgisiGetir(admin, rolKod);
    if (!rol) {
      return NextResponse.json({ error: "Geçersiz rol" }, { status: 400 });
    }
    patch.rol_id = rol.id;
    appMeta.rol = rol.kod;
    appMeta.rol_adi = rol.ad;
    appMeta.izinler = rol.izinler;
  }

  if (aktif != null) {
    patch.aktif = aktif;
  }

  const { error: updateError } = await admin
    .from(KULLANICILAR_TABLE)
    .update(patch)
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const authPatch: Record<string, unknown> = { app_metadata: appMeta };
  if (aktif != null) authPatch.ban_duration = aktif ? "none" : "876000h";

  const { error: authError } = await admin.auth.admin.updateUserById(
    id,
    authPatch
  );
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
