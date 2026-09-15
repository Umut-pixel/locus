import { NextResponse } from "next/server";

import { oturumIzinKontrol } from "@/lib/api-auth";
import { usernameToEmail } from "@/lib/kullanici-email";
import {
  gucluGeciciSifre,
  normalizeKullaniciAdi,
  rolBilgisiGetir,
} from "@/lib/kullanici-provisioning";
import {
  createSupabaseAdmin,
  KULLANICILAR_TABLE,
  ROLLER_TABLE,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

interface KullaniciSatiri {
  id: string;
  ad_soyad: string;
  kullanici_adi: string;
  aktif: boolean;
  olusturuldu: string;
  roller: { kod: string; ad: string } | { kod: string; ad: string }[] | null;
}

function rolAdiCoz(roller: KullaniciSatiri["roller"]): { kod: string; ad: string } | null {
  if (!roller) return null;
  return Array.isArray(roller) ? (roller[0] ?? null) : roller;
}

/** GET — Kullanıcılar listesi + rol seçenekleri (Ayarlar → Kullanıcılar). */
export async function GET() {
  const oturum = await oturumIzinKontrol("kullanici_yonetimi");
  if (!oturum) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const [kullanicilarRes, rollerRes] = await Promise.all([
    admin
      .from(KULLANICILAR_TABLE)
      .select(
        `id, ad_soyad, kullanici_adi, aktif, olusturuldu, roller:rol_id (kod, ad)`
      )
      .order("olusturuldu", { ascending: true }),
    admin.from(ROLLER_TABLE).select("kod, ad").order("id"),
  ]);

  if (kullanicilarRes.error) {
    return NextResponse.json(
      { error: kullanicilarRes.error.message },
      { status: 500 }
    );
  }
  if (rollerRes.error) {
    return NextResponse.json({ error: rollerRes.error.message }, { status: 500 });
  }

  const items = (
    (kullanicilarRes.data as unknown as KullaniciSatiri[] | null) ?? []
  ).map((r) => {
    const rol = rolAdiCoz(r.roller);
    return {
      id: r.id,
      adSoyad: r.ad_soyad,
      kullaniciAdi: r.kullanici_adi,
      aktif: r.aktif,
      olusturuldu: r.olusturuldu,
      rolKod: rol?.kod ?? null,
      rolAdi: rol?.ad ?? null,
    };
  });

  return NextResponse.json({ items, roller: rollerRes.data ?? [] });
}

interface CreateBody {
  kullaniciAdi?: unknown;
  adSoyad?: unknown;
  rolKod?: unknown;
}

/** POST { kullaniciAdi, adSoyad, rolKod } — yeni kullanıcı + geçici şifre. */
export async function POST(request: Request) {
  const oturum = await oturumIzinKontrol("kullanici_yonetimi");
  if (!oturum) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const kullaniciAdiHam =
    typeof body.kullaniciAdi === "string" ? body.kullaniciAdi.trim() : "";
  const adSoyad = typeof body.adSoyad === "string" ? body.adSoyad.trim() : "";
  const rolKod = typeof body.rolKod === "string" ? body.rolKod.trim() : "";

  if (!kullaniciAdiHam || !adSoyad || !rolKod) {
    return NextResponse.json(
      { error: "Kullanıcı adı, ad soyad ve rol gerekli" },
      { status: 400 }
    );
  }

  const kullaniciAdi = normalizeKullaniciAdi(kullaniciAdiHam);
  if (!/^[a-z0-9._-]{3,40}$/.test(kullaniciAdi)) {
    return NextResponse.json(
      {
        error:
          "Kullanıcı adı yalnızca harf, rakam, nokta, tire, alt çizgi içerebilir (3-40 karakter)",
      },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdmin();

  const rol = await rolBilgisiGetir(admin, rolKod);
  if (!rol) {
    return NextResponse.json({ error: "Geçersiz rol" }, { status: 400 });
  }

  const gecici = gucluGeciciSifre();
  const email = usernameToEmail(kullaniciAdi);

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: gecici,
      email_confirm: true,
      app_metadata: {
        rol: rol.kod,
        rol_adi: rol.ad,
        kullanici_adi: kullaniciAdi,
        ad_soyad: adSoyad,
        izinler: rol.izinler,
      },
    });

  if (createError || !created.user) {
    const msg = createError?.message ?? "Kullanıcı oluşturulamadı";
    const status = /already.*registered|duplicate/i.test(msg) ? 409 : 500;
    return NextResponse.json(
      {
        error:
          status === 409
            ? "Bu kullanıcı adı zaten kullanılıyor"
            : `Kullanıcı oluşturulamadı: ${msg}`,
      },
      { status }
    );
  }

  const { error: insertError } = await admin.from(KULLANICILAR_TABLE).insert({
    id: created.user.id,
    ad_soyad: adSoyad,
    kullanici_adi: kullaniciAdi,
    rol_id: rol.id,
    aktif: true,
    olusturan: oturum.id,
  });

  if (insertError) {
    // Auth tarafında hesap açıldı ama profil satırı başarısız — temizle,
    // yarım kalmış (login olur ama kullanicilar'da yok) bir hesap bırakma.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json(
      { error: `Kullanıcı profili kaydedilemedi: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: created.user.id,
    kullaniciAdi,
    adSoyad,
    rolKod: rol.kod,
    rolAdi: rol.ad,
    geciciSifre: gecici,
  });
}
