import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const MIN_SIFRE_UZUNLUK = 6;

interface Body {
  mevcutSifre?: unknown;
  yeniSifre?: unknown;
}

/**
 * POST { mevcutSifre, yeniSifre } — oturumdaki kullanıcı KENDİ şifresini
 * değiştirir. Herhangi bir izin gerektirmez, yalnızca oturum (herkes kendi
 * hesabının sahibidir). Admin'in BAŞKA bir kullanıcının şifresini sıfırlaması
 * ayrı bir yol: /api/kullanicilar/[id]/sifre-sifirla (kullanici_yonetimi).
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const mevcutSifre = typeof body.mevcutSifre === "string" ? body.mevcutSifre : "";
  const yeniSifre = typeof body.yeniSifre === "string" ? body.yeniSifre : "";

  if (!mevcutSifre || !yeniSifre) {
    return NextResponse.json(
      { error: "Mevcut ve yeni şifre gerekli" },
      { status: 400 }
    );
  }
  if (yeniSifre.length < MIN_SIFRE_UZUNLUK) {
    return NextResponse.json(
      { error: `Yeni şifre en az ${MIN_SIFRE_UZUNLUK} karakter olmalı` },
      { status: 400 }
    );
  }
  if (yeniSifre === mevcutSifre) {
    return NextResponse.json(
      { error: "Yeni şifre mevcut şifreyle aynı olamaz" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Sunucu yapılandırma hatası" },
      { status: 500 }
    );
  }

  // Mevcut şifreyi doğrula — ayrı, cookie'siz bir client'la (kullanıcının
  // gerçek oturum cookie'sine dokunmadan). Bu app'te e-posta ile şifre
  // kurtarma yok, bu yüzden kilitlenmemiş bir tarayıcıdan sessizce ele
  // geçirmeyi önlemek için mevcut şifre isteniyor.
  const dogrulamaClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const { error: dogrulamaError } = await dogrulamaClient.auth.signInWithPassword({
    email: user.email,
    password: mevcutSifre,
  });
  if (dogrulamaError) {
    return NextResponse.json({ error: "Mevcut şifre yanlış" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: yeniSifre,
  });
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Şifre güncellenemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
