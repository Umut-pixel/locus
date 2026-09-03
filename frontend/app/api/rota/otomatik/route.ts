import { NextResponse } from "next/server";

import { DEPOT } from "@/lib/depot";
import {
  otomatikPlanKur,
  type OtomatikPlanParams,
} from "@/lib/rota/orkestrasyon";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
/** Araç başına bir Google Routes çağrısı var; 4 araçlı planda ~20 sn. */
export const maxDuration = 60;

const TASLAKLAR_TABLE = "rota_taslaklari";

/**
 * POST /api/rota/otomatik — bekleyen yükten plan TASLAĞI kurar.
 *
 * Veritabanına plan YAZMAZ; yalnız taslağı `rota_taslaklari`'na koyar ve
 * kimliğini döndürür. Kaydetme ayrı ve açık bir adım: /api/rota/plan'a
 * { taslakId } gönderilir. Sebep — kaydetme sil-sonra-yaz, yani o günün
 * mevcut planını ezer; onay kullanıcıdan gelmeli.
 *
 * `GOOGLE_MAPS_API_KEY` sunucuda kalır (NEXT_PUBLIC_ DEĞİL). Anahtar yoksa
 * plan yine kurulur, yalnız durak sırası trafiğe göre optimize edilmez.
 *
 * Oturum koruması middleware'den gelir; agent için
 * `Authorization: Bearer <AGENT_API_SECRET>` kabul edilir.
 *
 * Body: { gunPenceresi?, strateji?, uzakAyir?, aracKodlari?, planTarihi? }
 */
export async function POST(request: Request) {
  let govde: unknown = {};
  try {
    const metin = await request.text();
    govde = metin ? JSON.parse(metin) : {};
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const o = (govde ?? {}) as Record<string, unknown>;

  const params: OtomatikPlanParams = {
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined,
  };

  if (o.gunPenceresi === null) {
    params.gunPenceresi = null;
  } else if (typeof o.gunPenceresi === "number" && Number.isFinite(o.gunPenceresi)) {
    params.gunPenceresi = Math.max(1, Math.floor(o.gunPenceresi));
  }
  if (o.strateji === "sweep" || o.strateji === "ffd") {
    params.strateji = o.strateji;
  }
  if (typeof o.uzakAyir === "boolean") {
    params.uzakAyir = o.uzakAyir;
  }
  if (Array.isArray(o.aracKodlari)) {
    const kodlar = o.aracKodlari
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim());
    if (kodlar.length === 0) {
      return NextResponse.json(
        { error: "aracKodlari boş gönderildi; filo seçimini sisteme bırakmak için alanı hiç göndermeyin." },
        { status: 400 }
      );
    }
    params.aracKodlari = kodlar;
  }
  if (typeof o.planTarihi === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.planTarihi)) {
    params.planTarihi = o.planTarihi;
  }

  try {
    const admin = createSupabaseAdmin();
    const taslak = await otomatikPlanKur(admin, params);

    if (taslak.planlar.length === 0) {
      return NextResponse.json(
        {
          error:
            "Plana girecek durak bulunamadı. Bekleyen sipariş yok ya da çıkabilecek araç kalmadı.",
          koordinatsiz: taslak.koordinatsiz,
        },
        { status: 409 }
      );
    }

    const ozet = {
      planTarihi: taslak.planTarihi,
      aracSayisi: taslak.planlar.length,
      atananDurak: taslak.atananDurak,
      havuzdaKalan: taslak.havuzdaKalan,
      koordinatsiz: taslak.koordinatsiz,
      toplamKg: Math.round(taslak.toplamKg),
    };

    const { data, error } = await admin
      .from(TASLAKLAR_TABLE)
      .insert({
        plan_tarihi: taslak.planTarihi,
        payload: taslak,
        ozet,
        kaynak: "agent",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      taslakId: String(data.id),
      ozet,
      // Sohbetteki harita bloğu bunu doğrudan kullanır; depo koordinatını
      // modele yazdırmıyoruz, buradan geliyor.
      depo: { lat: DEPOT.lat, lon: DEPOT.lon },
      planlar: taslak.planlar,
      optimizeHatalari: taslak.optimizeHatalari,
    });
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : "Plan kurulamadı.";
    console.error("[rota/otomatik]", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 500 });
  }
}
