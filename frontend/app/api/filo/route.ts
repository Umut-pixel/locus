import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const ARACLAR = "araclar";
const SOFORLER = "soforler";

/**
 * Filo ve şoför kadrosu düzenleme.
 *
 * Neden API rotası: bu iki tablo planlamanın TEK doğruluk kaynağı (Panorama'da
 * araç verisi yok, 1.979 sevk belgesinin hepsi aynı sahte plakada). İstemciden
 * doğrudan yazmak yerine sunucuda doğrulanıyor — oturum koruması middleware'den
 * geliyor ve bu yol AGENT_WRITABLE_PATHS'e eklenmedi (agent filoyu değiştiremez).
 */

const ARAC_SELECT =
  "kod,ad,cuval_kapasite,palet_kapasite,max_kg,max_kg_teyitli," +
  "ehliyet_sinifi,takograf,aktif,sira,not_metni";
const SOFOR_SELECT = "kod,ad,ehliyet_sinifi,aktif,sira,not_metni";

function metin(v: unknown, enFazla: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= enFazla ? t : null;
}

function pozitifSayi(v: unknown, enFazla: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 && n <= enFazla ? n : null;
}

export async function GET() {
  const db = createSupabaseAdmin();

  const [araclar, soforler] = await Promise.all([
    db.from(ARACLAR).select(ARAC_SELECT).order("sira", { ascending: true }),
    db.from(SOFORLER).select(SOFOR_SELECT).order("sira", { ascending: true }),
  ]);

  if (araclar.error || soforler.error) {
    const mesaj = araclar.error?.message ?? soforler.error?.message ?? "";
    console.error("[filo] GET", mesaj);
    return NextResponse.json({ error: "Filo okunamadı." }, { status: 500 });
  }

  return NextResponse.json({
    araclar: araclar.data ?? [],
    soforler: soforler.data ?? [],
  });
}

/**
 * PATCH { tur: "arac" | "sofor", kod, alanlar: {...} }
 *
 * Yalnız beyaz listedeki alanlar yazılır. `ehliyet_sinifi` bilinçli olarak
 * listede: kadro değişince ("artık Ramazan da Isuzu kullanıyor") kod değil
 * veri güncellensin.
 */
export async function PATCH(request: Request) {
  let govde: unknown;
  try {
    govde = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const { tur, kod, alanlar } = (govde ?? {}) as {
    tur?: unknown;
    kod?: unknown;
    alanlar?: unknown;
  };

  const kodStr = metin(kod, 100);
  if (!kodStr || (tur !== "arac" && tur !== "sofor")) {
    return NextResponse.json(
      { error: "tur ('arac' | 'sofor') ve kod gerekli." },
      { status: 400 }
    );
  }

  const gelen = (alanlar ?? {}) as Record<string, unknown>;
  const yazilacak: Record<string, unknown> = {};

  const ad = metin(gelen.ad, 120);
  if (ad != null) yazilacak.ad = ad;
  if (typeof gelen.aktif === "boolean") yazilacak.aktif = gelen.aktif;
  if (gelen.ehliyet_sinifi === "B" || gelen.ehliyet_sinifi === "C") {
    yazilacak.ehliyet_sinifi = gelen.ehliyet_sinifi;
  }

  if (tur === "arac") {
    // 5.000 çuval / 40 ton: gerçekçi üst sınırlar — yazım hatası (60000 gibi)
    // kapasiteyi sessizce anlamsız yapmasın.
    const cuval = pozitifSayi(gelen.cuval_kapasite, 5000);
    if (cuval != null) yazilacak.cuval_kapasite = Math.round(cuval);

    const palet = pozitifSayi(gelen.palet_kapasite, 100);
    if (palet != null) yazilacak.palet_kapasite = Math.round(palet);

    const maxKg = pozitifSayi(gelen.max_kg, 40000);
    if (maxKg != null) {
      yazilacak.max_kg = maxKg;
      // Elle girilen istiap haddi teyitli sayılır — "tahmini" rozeti kalksın.
      yazilacak.max_kg_teyitli = true;
    }
    if (typeof gelen.takograf === "boolean") yazilacak.takograf = gelen.takograf;
  }

  if (Object.keys(yazilacak).length === 0) {
    return NextResponse.json(
      { error: "Güncellenecek geçerli alan yok." },
      { status: 400 }
    );
  }
  yazilacak.guncellendi = new Date().toISOString();

  const db = createSupabaseAdmin();
  const tablo = tur === "arac" ? ARACLAR : SOFORLER;
  const secim = tur === "arac" ? ARAC_SELECT : SOFOR_SELECT;

  const { data, error } = await db
    .from(tablo)
    .update(yazilacak)
    .eq("kod", kodStr)
    .select(secim)
    .maybeSingle();

  if (error) {
    console.error("[filo] PATCH", error.message);
    return NextResponse.json({ error: "Kayıt güncellenemedi." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ kayit: data });
}
