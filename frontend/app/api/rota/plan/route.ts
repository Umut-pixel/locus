import { NextResponse } from "next/server";

import { kaydetGovdesi, type RotaTaslagi } from "@/lib/rota/orkestrasyon";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const PLANLAR_TABLE = "sevkiyat_planlari";
const PLAN_DURAKLARI_TABLE = "sevkiyat_plan_duraklari";
const TASLAKLAR_TABLE = "rota_taslaklari";

interface GelenDurak {
  musteriKodu: string;
  kg: number;
  cuvalEsdeger: number;
}

interface GelenPlan {
  aracKod: string;
  /** Bu turu sürecek şoför — kadroda karşılığı yoksa null. */
  soforKod: string | null;
  /** Plan anındaki ad; şoför sonradan silinse bile geçmişte kalsın. */
  soforAd: string | null;
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

function metinVeyaNull(v: unknown, enFazla: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= enFazla ? t : null;
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
    soforKod: metinVeyaNull(o.soforKod, 100),
    soforAd: metinVeyaNull(o.soforAd, 120),
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

  const o = (govde ?? {}) as {
    planTarihi?: unknown;
    planlar?: unknown;
    taslakId?: unknown;
  };

  // Taslak yolu (sohbet): kullanıcı onayladıktan sonra AYNEN yazılır.
  // Yeniden hesaplamıyoruz — Google farklı bir sıra döndürürse ya da havuz
  // değişmişse, onaylanan plan ile yazılan plan ayrışırdı.
  let taslakId: string | null = null;
  let gelenPlanlar: unknown = o.planlar;
  let gelenTarih: unknown = o.planTarihi;

  if (typeof o.taslakId === "string" && o.taslakId.trim().length > 0) {
    taslakId = o.taslakId.trim();
    try {
      const admin = createSupabaseAdmin();
      const { data, error } = await admin
        .from(TASLAKLAR_TABLE)
        .select("payload,kaydedildi")
        .eq("id", taslakId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) {
        return NextResponse.json(
          { error: "Taslak bulunamadı; süresi dolmuş olabilir. Planı yeniden kurun." },
          { status: 404 }
        );
      }
      if (data.kaydedildi) {
        return NextResponse.json(
          { error: "Bu taslak zaten kaydedilmiş." },
          { status: 409 }
        );
      }

      const govdeTaslak = kaydetGovdesi(data.payload as RotaTaslagi);
      gelenPlanlar = govdeTaslak.planlar;
      gelenTarih = govdeTaslak.planTarihi;
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : "Taslak okunamadı.";
      console.error("[rota/plan] taslak", mesaj);
      return NextResponse.json({ error: mesaj }, { status: 500 });
    }
  }

  const planTarihi =
    typeof gelenTarih === "string" && /^\d{4}-\d{2}-\d{2}$/.test(gelenTarih)
      ? gelenTarih
      : new Date().toISOString().slice(0, 10);

  if (!Array.isArray(gelenPlanlar) || gelenPlanlar.length === 0) {
    return NextResponse.json(
      { error: "Kaydedilecek plan yok." },
      { status: 400 }
    );
  }

  const planlar: GelenPlan[] = [];
  const gorulenSoforler = new Set<string>();
  for (const p of gelenPlanlar) {
    const cozulen = planCoz(p);
    if (!cozulen) {
      return NextResponse.json(
        { error: "Plan gövdesi geçersiz (aracKod / duraklar)." },
        { status: 400 }
      );
    }
    // Araç günde tek sefer yapıyor — bir şoför iki araca binemez. Veritabanında
    // da kısıt var; burada yakalayıp anlaşılır bir hata dönüyoruz.
    if (cozulen.soforKod) {
      if (gorulenSoforler.has(cozulen.soforKod)) {
        return NextResponse.json(
          {
            error: `Aynı şoför birden fazla araca atanmış (${cozulen.soforAd ?? cozulen.soforKod}).`,
          },
          { status: 400 }
        );
      }
      gorulenSoforler.add(cozulen.soforKod);
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

    // Şoför başka bir araca kaydırıldıysa eski satırı da temizle — yoksa
    // (plan_tarihi, sofor_kod) benzersizlik kısıtı kaydı reddederdi.
    const soforKodlari = [...gorulenSoforler];
    if (soforKodlari.length > 0) {
      const { error: soforSilmeHatasi } = await admin
        .from(PLANLAR_TABLE)
        .delete()
        .eq("plan_tarihi", planTarihi)
        .in("sofor_kod", soforKodlari);
      if (soforSilmeHatasi) throw new Error(soforSilmeHatasi.message);
    }

    const { data: eklenen, error: eklemeHatasi } = await admin
      .from(PLANLAR_TABLE)
      .insert(
        planlar.map((p) => ({
          plan_tarihi: planTarihi,
          arac_kod: p.aracKod,
          sofor_kod: p.soforKod,
          sofor_ad: p.soforAd,
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

    // Taslak tüketildi — aynı taslak ikinci kez yazılmasın.
    if (taslakId) {
      const { error: damgaHatasi } = await admin
        .from(TASLAKLAR_TABLE)
        .update({ kaydedildi: new Date().toISOString() })
        .eq("id", taslakId);
      // Plan zaten yazıldı; damga düşerse uyar ama isteği başarısız sayma.
      if (damgaHatasi) {
        console.error("[rota/plan] taslak damgası", damgaHatasi.message);
      }
    }

    return NextResponse.json({
      planTarihi,
      planSayisi: eklenen?.length ?? 0,
      durakSayisi: durakSatirlari.length,
      taslakId,
    });
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : "Plan kaydedilemedi.";
    console.error("[rota/plan]", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 500 });
  }
}
