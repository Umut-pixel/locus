import { NextResponse } from "next/server";

import { parseIzinler } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * Oturumdaki kullanıcının rol/izin bilgisi — `user.app_metadata`'dan okunur
 * (middleware'in kullandığı KAYNAKLA aynı), DB'ye ayrı sorgu atmaz. Bu, nav
 * filtrelemesinin gösterdiğiyle middleware'in fiilen izin verdiğinin her
 * zaman birebir aynı olmasını garantiler — biri DB'den taze, diğeri JWT'den
 * bayat okusaydı ikisi arasında kafa karıştırıcı bir sapma olurdu.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }

  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const kullaniciAdi =
    typeof appMeta.kullanici_adi === "string"
      ? appMeta.kullanici_adi
      : (user.email?.split("@")[0] ?? "");
  const adSoyad =
    typeof appMeta.ad_soyad === "string" ? appMeta.ad_soyad : kullaniciAdi;
  const rol = typeof appMeta.rol === "string" ? appMeta.rol : null;
  const rolAdi = typeof appMeta.rol_adi === "string" ? appMeta.rol_adi : rol;
  const izinler = parseIzinler(appMeta.izinler);

  return NextResponse.json({
    id: user.id,
    kullaniciAdi,
    adSoyad,
    rol,
    rolAdi,
    izinler,
  });
}
