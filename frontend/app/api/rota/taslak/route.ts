import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const TASLAKLAR_TABLE = "rota_taslaklari";
/**
 * `rota_taslaklari` esasen agent'ın (`kaynak='agent'`) sohbetten kurduğu,
 * onay bekleyen tek seferlik taslaklar için var (bkz. /api/rota/plan).
 * Harita sayfasındaki CANLI, sürekli güncellenen taslak ayrı bir `kaynak`
 * değeriyle aynı tabloyu paylaşıyor — iki akış aynı id'yi asla kullanmıyor,
 * birbirine karışmaz. 1 günlük TTL cron'u (`rota_taslak_temizligi`) da
 * yalnız bu değeri hedefliyor.
 */
const KAYNAK = "harita-canli";

type Plan = Record<string, string[]>;

function planCoz(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const plan: Plan = {};
  for (const [aracKod, liste] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof aracKod !== "string" || aracKod.length === 0 || !Array.isArray(liste)) {
      return null;
    }
    plan[aracKod] = liste.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  return plan;
}

function bosMu(plan: Plan): boolean {
  return Object.values(plan).every((liste) => liste.length === 0);
}

/**
 * GET /api/rota/taslak — sayfa yenilenince kaybolmasın diye en son yazılan
 * (henüz kalıcı plana dönüştürülmemiş) canlı taslağı döner.
 */
export async function GET() {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from(TASLAKLAR_TABLE)
      .select("id, payload, guncellendi")
      .eq("kaynak", KAYNAK)
      .is("kaydedildi", null)
      .order("guncellendi", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ taslak: null });

    const plan = planCoz((data.payload as { plan?: unknown } | null)?.plan);
    return NextResponse.json({
      taslak: { id: data.id as string, plan: plan ?? {}, guncellendi: data.guncellendi as string },
    });
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : "Taslak okunamadı.";
    console.error("[rota/taslak] GET", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 500 });
  }
}

/**
 * POST /api/rota/taslak — mevcut taslağı (id verilmişse) günceller ya da
 * yeni bir tane kurar. Plan tamamen boşalmışsa satır silinir — boş bir
 * taslağı saklamanın anlamı yok, sayfa açılışında gereksiz bir GET+hydrate
 * turu daha yaratır.
 *
 * Body: { id?: string | null, plan: Record<aracKod, musteriKodu[]> }
 */
export async function POST(request: Request) {
  let govde: unknown;
  try {
    govde = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const o = (govde ?? {}) as { id?: unknown; plan?: unknown };
  const plan = planCoz(o.plan);
  if (!plan) {
    return NextResponse.json({ error: "plan gövdesi geçersiz." }, { status: 400 });
  }
  const id = typeof o.id === "string" && o.id.trim().length > 0 ? o.id.trim() : null;

  try {
    const admin = createSupabaseAdmin();

    if (bosMu(plan)) {
      if (id) {
        const { error } = await admin
          .from(TASLAKLAR_TABLE)
          .delete()
          .eq("id", id)
          .eq("kaynak", KAYNAK);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ id: null });
    }

    const guncellendi = new Date().toISOString();

    if (id) {
      const { data, error } = await admin
        .from(TASLAKLAR_TABLE)
        .update({ payload: { plan }, guncellendi })
        .eq("id", id)
        .eq("kaynak", KAYNAK)
        .is("kaydedildi", null)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      // Satır bulunamadı (ör. cron silmiş) — yeni satır kur, id değişecek.
      if (data) return NextResponse.json({ id: data.id as string });
    }

    const { data: eklenen, error: eklemeHatasi } = await admin
      .from(TASLAKLAR_TABLE)
      .insert({ payload: { plan }, kaynak: KAYNAK, guncellendi })
      .select("id")
      .single();
    if (eklemeHatasi) throw new Error(eklemeHatasi.message);

    return NextResponse.json({ id: eklenen.id as string });
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : "Taslak kaydedilemedi.";
    console.error("[rota/taslak] POST", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 500 });
  }
}
