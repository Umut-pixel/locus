import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const PLANLAR_TABLE = "sevkiyat_planlari";
const PLAN_DURAKLARI_TABLE = "sevkiyat_plan_duraklari";

interface GelenDurak {
  musteriKodu: string;
  kg: number;
  cuvalEsdeger: number;
}

interface GelenPlan {
  aracKod: string;
  duraklar: GelenDurak[];
  kgDoluluk: number | null;
  cuvalDoluluk: number | null;
  googleSureSn: number | null;
  googleMesafeM: number | null;
}

function sayi(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sayiVeyaNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function planCoz(raw: unknown): GelenPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const aracKod = typeof o.aracKod === "string" ? o.aracKod.trim() : "";
  if (!aracKod || !Array.isArray(o.duraklar) || o.duraklar.length === 0) {
    return null;
  }

  const duraklar: GelenDurak[] = [];
  for (const d of o.duraklar) {
    const kod =
      d && typeof d === "object" && typeof (d as { musteriKodu?: unknown }).musteriKodu === "string"
        ? ((d as { musteriKodu: string }).musteriKodu).trim()
        : "";
    if (!kod) return null;
    duraklar.push({
      musteriKodu: kod,
      kg: sayi((d as { kg?: unknown }).kg),
      cuvalEsdeger: sayi((d as { cuvalEsdeger?: unknown }).cuvalEsdeger),
    });
  }

  return {
    aracKod,
    duraklar,
    kgDoluluk: sayiVeyaNull(o.kgDoluluk),
    cuvalDoluluk: sayiVeyaNull(o.cuvalDoluluk),
    googleSureSn: sayiVeyaNull(o.googleSureSn),
    googleMesafeM: sayiVeyaNull(o.googleMesafeM),
  };
}

/**
 * POST /api/rota/plan — günün araç planlarını kaydeder.
 *
 * Aynı tarih + araç için var olan plan SİLİNİP yeniden yazılır: kullanıcı
 * planı düzeltip tekrar kaydettiğinde çift kayıt oluşmasın. Durak yükleri
 * plan anında dondurulur (bkz. sql/sevkiyat_plani_sema.sql).
 *
 * Body: { planTarihi?: "YYYY-MM-DD", planlar: GelenPlan[] }
 */
export async function POST(request: Request) {
  let govde: unknown;
  try {
    govde = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const o = (govde ?? {}) as { planTarihi?: unknown; planlar?: unknown };
  const planTarihi =
    typeof o.planTarihi === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.planTarihi)
      ? o.planTarihi
      : new Date().toISOString().slice(0, 10);

  if (!Array.isArray(o.planlar) || o.planlar.length === 0) {
    return NextResponse.json(
      { error: "Kaydedilecek plan yok." },
      { status: 400 }
    );
  }

  const planlar: GelenPlan[] = [];
  for (const p of o.planlar) {
    const cozulen = planCoz(p);
    if (!cozulen) {
      return NextResponse.json(
        { error: "Plan gövdesi geçersiz (aracKod / duraklar)." },
        { status: 400 }
      );
    }
    planlar.push(cozulen);
  }

  try {
    const admin = createSupabaseAdmin();

    // Aynı gün + aynı araç için önceki kaydı temizle (duraklar cascade siler)
    const { error: silmeHatasi } = await admin
      .from(PLANLAR_TABLE)
      .delete()
      .eq("plan_tarihi", planTarihi)
      .in(
        "arac_kod",
        planlar.map((p) => p.aracKod)
      );
    if (silmeHatasi) throw new Error(silmeHatasi.message);

    const { data: eklenen, error: eklemeHatasi } = await admin
      .from(PLANLAR_TABLE)
      .insert(
        planlar.map((p) => ({
          plan_tarihi: planTarihi,
          arac_kod: p.aracKod,
          durak_sayisi: p.duraklar.length,
          toplam_kg: p.duraklar.reduce((t, d) => t + d.kg, 0),
          toplam_cuval: p.duraklar.reduce((t, d) => t + d.cuvalEsdeger, 0),
          kg_doluluk: p.kgDoluluk,
          cuval_doluluk: p.cuvalDoluluk,
          google_sure_sn: p.googleSureSn,
          google_mesafe_m: p.googleMesafeM,
        }))
      )
      .select("id,arac_kod");
    if (eklemeHatasi) throw new Error(eklemeHatasi.message);

    const idler = new Map<string, string>();
    for (const r of eklenen ?? []) {
      idler.set(String(r.arac_kod), String(r.id));
    }

    const durakSatirlari = planlar.flatMap((p) => {
      const planId = idler.get(p.aracKod);
      if (!planId) return [];
      return p.duraklar.map((d, i) => ({
        plan_id: planId,
        sira: i + 1,
        musteri_kodu: d.musteriKodu,
        kg: d.kg,
        cuval_esdeger: d.cuvalEsdeger,
      }));
    });

    if (durakSatirlari.length > 0) {
      const { error: durakHatasi } = await admin
        .from(PLAN_DURAKLARI_TABLE)
        .insert(durakSatirlari);
      if (durakHatasi) throw new Error(durakHatasi.message);
    }

    return NextResponse.json({
      planTarihi,
      planSayisi: eklenen?.length ?? 0,
      durakSayisi: durakSatirlari.length,
    });
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : "Plan kaydedilemedi.";
    console.error("[rota/plan]", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 500 });
  }
}
