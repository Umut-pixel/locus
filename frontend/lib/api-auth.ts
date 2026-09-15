import { parseIzinler, type IzinKodu } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export interface OturumBilgisi {
  id: string;
  izinler: IzinKodu[];
}

/**
 * API route'larda middleware'in ÜSTÜNE savunma katmanı — route'un kendisi de
 * gerekli izni doğrular (bkz. app/api/potansiyel/tarama/route.ts'deki
 * mevcut desen). Oturum yoksa veya izin eksikse null döner.
 */
export async function oturumIzinKontrol(
  gereken: IzinKodu
): Promise<OturumBilgisi | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const izinler = parseIzinler(appMeta.izinler);
  if (!izinler.includes(gereken)) return null;

  return { id: user.id, izinler };
}
