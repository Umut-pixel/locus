import { NextResponse } from "next/server";

import {
  PANORAMA_ZINCIRLERI,
  zincirleriCoz,
  type RaporMetrigi,
  type RaporOzeti,
} from "@/lib/panorama-raporlar";
import { PANORAMA_SYNC_RUNS_TABLE } from "@/lib/sync/fetch-panorama";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const OZET_RPC = "panorama_rapor_ozeti";

interface RpcSatiri {
  report_id: number;
  durum: string | null;
  satir_sayisi: number | null;
  onceki_satir: number | null;
  tamamlandi_at: string | null;
  hata: string | null;
  metrikler: unknown;
}

function metrikleriCoz(ham: unknown): RaporMetrigi[] {
  if (!Array.isArray(ham)) return [];
  return ham.flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const o = m as Record<string, unknown>;
    const deger = Number(o.deger);
    if (typeof o.etiket !== "string" || !Number.isFinite(deger)) return [];
    return [
      {
        etiket: o.etiket,
        deger,
        tip: o.tip === "para" ? ("para" as const) : ("adet" as const),
      },
    ];
  });
}

/**
 * POST /api/sync/panorama/ozet — çekim sonrası "ne geldi" özeti.
 *
 * Rakamlar doğrudan veritabanından okunur, MODELDEN GEÇMEZ: hem token
 * harcanmaz hem de asistanın sayı uydurma ihtimali kalmaz.
 *
 * Body: { reportIds?: (string|number)[] }  — boş = bütün zincirler.
 */
export async function POST(request: Request) {
  let ham: { reportIds?: unknown } = {};
  try {
    const metin = await request.text();
    if (metin.trim()) ham = JSON.parse(metin);
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const secim = Array.isArray(ham.reportIds)
    ? ham.reportIds.filter(
        (v): v is string | number => typeof v === "string" || typeof v === "number"
      )
    : null;

  const { zincirler, bilinmeyen } = zincirleriCoz(secim);
  if (bilinmeyen.length > 0) {
    return NextResponse.json(
      { error: `Tanınmayan rapor: ${bilinmeyen.join(", ")}.` },
      { status: 400 }
    );
  }
  if (zincirler.length === 0) {
    return NextResponse.json({ raporlar: [] });
  }

  const idler = zincirler.map((z) => z.reportId);

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc(OZET_RPC, { p_report_ids: idler });

    if (!error && Array.isArray(data)) {
      const byId = new Map<number, RpcSatiri>();
      for (const satir of data as RpcSatiri[]) {
        byId.set(Number(satir.report_id), satir);
      }
      const raporlar: RaporOzeti[] = zincirler.map((z) => {
        const s = byId.get(z.reportId);
        return {
          anahtar: z.anahtar,
          ad: z.ad,
          reportId: z.reportId,
          durum: s?.durum ?? null,
          satirSayisi: s?.satir_sayisi ?? null,
          oncekiSatir: s?.onceki_satir ?? null,
          tamamlandiAt: s?.tamamlandi_at ?? null,
          hata: s?.hata ?? null,
          metrikler: metrikleriCoz(s?.metrikler),
        };
      });
      return NextResponse.json({ raporlar });
    }

    // RPC henüz uygulanmadıysa (sql/panorama_rapor_ozeti.sql) özet yine
    // çıksın — yalnız içerik metrikleri olmadan. Özellik, migration
    // beklemeden çalışsın diye burada sessizce sadeleşiyor.
    console.warn("[sync/panorama/ozet] RPC yok, sync_runs'a düşülüyor:", error?.message);

    const { data: kosular, error: kosuHatasi } = await admin
      .from(PANORAMA_SYNC_RUNS_TABLE)
      .select("report_id,durum,satir_sayisi,tamamlandi_at,cekildi_at,hata")
      .in("report_id", idler)
      .order("cekildi_at", { ascending: false });

    if (kosuHatasi) throw new Error(kosuHatasi.message);

    const enYeni = new Map<number, (typeof kosular)[number]>();
    for (const k of kosular ?? []) {
      const id = Number(k.report_id);
      if (!enYeni.has(id)) enYeni.set(id, k);
    }

    const raporlar: RaporOzeti[] = zincirler.map((z) => {
      const k = enYeni.get(z.reportId);
      return {
        anahtar: z.anahtar,
        ad: z.ad,
        reportId: z.reportId,
        durum: k?.durum == null ? null : String(k.durum),
        satirSayisi: k?.satir_sayisi == null ? null : Number(k.satir_sayisi),
        oncekiSatir: null,
        tamamlandiAt: k?.tamamlandi_at == null ? null : String(k.tamamlandi_at),
        hata: k?.hata == null ? null : String(k.hata),
        metrikler: [],
      };
    });

    return NextResponse.json({ raporlar, sadeleştirilmis: true });
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : "Özet okunamadı.";
    console.error("[sync/panorama/ozet]", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 500 });
  }
}

/** Kayıt defteri dışarıdan da okunabilsin (test / hata ayıklama). */
export function GET() {
  return NextResponse.json({
    zincirler: PANORAMA_ZINCIRLERI.map((z) => ({
      anahtar: z.anahtar,
      ad: z.ad,
      reportId: z.reportId,
    })),
  });
}
