import { NextResponse } from "next/server";

import {
  DosyaTipiHatasi,
  detectDosyaTipi,
  geocodeEksikler,
  parseMusteriListesi,
  parseRutTanimListesi,
  parseSevkiyatRaporuKup,
  readWorkbook,
  type DosyaTipi,
  type UploadResult,
} from "@/lib/import";
import {
  MUSTERILER_TABLE,
  YUKLEME_LOGLARI_TABLE,
  createSupabaseAdmin,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 250;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchExistingCodes(
  admin: ReturnType<typeof createSupabaseAdmin>,
  codes: string[]
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < codes.length; i += BATCH) {
    const chunk = codes.slice(i, i + BATCH);
    const { data, error } = await admin
      .from(MUSTERILER_TABLE)
      .select("musteri_kodu")
      .in("musteri_kodu", chunk);
    if (error) throw new Error(`Mevcut müşteri sorgusu başarısız: ${error.message}`);
    for (const row of data ?? []) {
      existing.add(row.musteri_kodu as string);
    }
  }
  return existing;
}

async function upsertBatch(
  admin: ReturnType<typeof createSupabaseAdmin>,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await admin.from(MUSTERILER_TABLE).upsert(chunk, {
      onConflict: "musteri_kodu",
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`Upsert başarısız: ${error.message}`);
  }
}

/**
 * Kısmi alan güncellemesi — upsert kullanılamaz: PostgREST INSERT
 * aşamasında unvan NOT NULL ihlali üretir (mevcut PK olsa bile).
 * guncellendi trigger ile otomatik set edilir; yine de açıkça gönderiyoruz.
 */
async function updateByMusteriKodu(
  admin: ReturnType<typeof createSupabaseAdmin>,
  rows: Array<{ musteri_kodu: string } & Record<string, unknown>>
): Promise<void> {
  const ts = nowIso();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(({ musteri_kodu, ...fields }) =>
        admin
          .from(MUSTERILER_TABLE)
          .update({ ...fields, guncellendi: ts })
          .eq("musteri_kodu", musteri_kodu)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      throw new Error(`Güncelleme başarısız: ${failed.error.message}`);
    }
  }
}

async function kaydetYuklemeLogu(
  admin: ReturnType<typeof createSupabaseAdmin>,
  input: {
    dosyaAdi: string;
    dosyaTipi: DosyaTipi;
    dosyaBoyutu: number;
    result: UploadResult;
  }
): Promise<{ id: string; yuklenmeZamani: string }> {
  const { data, error } = await admin
    .from(YUKLEME_LOGLARI_TABLE)
    .insert({
      dosya_adi: input.dosyaAdi,
      dosya_tipi: input.dosyaTipi,
      dosya_boyutu_byte: input.dosyaBoyutu,
      islenen_satir: input.result.islenenSatir,
      yeni_musteri: input.result.yeniMusteri,
      guncellenen_musteri: input.result.guncellenenMusteri,
      geocode_basarisiz: input.result.geocodeBasarisiz,
      eslesmeyen_kod_sayisi: input.result.eslesmeyenMusteriKodlari.length,
      uyarilar: input.result.uyarilar ?? null,
      durum: "ok",
    })
    .select("id, yuklenme_zamani")
    .single();

  if (error || !data) {
    throw new Error(`Yükleme logu yazılamadı: ${error?.message ?? "bilinmeyen"}`);
  }

  return {
    id: data.id as string,
    yuklenmeZamani: data.yuklenme_zamani as string,
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return jsonError("Dosya bulunamadı. 'file' alanı gerekli.");
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return jsonError("Yalnızca .xlsx / .xls dosyaları kabul edilir.");
    }

    if (file.size === 0) {
      return jsonError("Dosya boş.");
    }

    const buffer = await file.arrayBuffer();
    let workbook;
    try {
      workbook = readWorkbook(buffer);
    } catch (err) {
      return jsonError(
        err instanceof Error
          ? `Dosya okunamadı: ${err.message}`
          : "Dosya okunamadı."
      );
    }

    if (!workbook.headers.length) {
      return jsonError("Excel başlık satırı bulunamadı.");
    }

    let tip: DosyaTipi;
    try {
      tip = detectDosyaTipi(workbook.headers);
    } catch (err) {
      if (err instanceof DosyaTipiHatasi) return jsonError(err.message);
      throw err;
    }

    const admin = createSupabaseAdmin();
    const uyarilar: string[] = [];
    const ts = nowIso();

    let result: UploadResult;

    if (tip === "MusteriListesi") {
      const parsed = parseMusteriListesi(workbook.rows);
      if (parsed.dedupUyari) {
        uyarilar.push(
          `Dedup uyarısı: STKodu/STKod dışında farklılaşan kolonlar var (${parsed.farklilasanKolonlar.join(", ")}). En dolu satır tutuldu.`
        );
      }
      if (parsed.bolgeDisi > 0) {
        uyarilar.push(
          `${parsed.bolgeDisi} müşteri 8-il filtresi dışında bırakıldı.`
        );
      }

      const geocoded = await geocodeEksikler(parsed.rows);
      const codes = geocoded.rows.map((r) => r.musteri_kodu);
      const existing = await fetchExistingCodes(admin, codes);
      const yeni = codes.filter((c) => !existing.has(c)).length;
      const guncellenen = codes.length - yeni;

      const payloads = geocoded.rows.map((r) => {
        const base: Record<string, unknown> = {
          musteri_kodu: r.musteri_kodu,
          unvan: r.unvan,
          adres: r.adres,
          sehir: r.sehir,
          ilce: r.ilce,
          telefon: r.telefon,
          satis_temsilcileri: r.satis_temsilcileri,
          bolge_grubu: r.bolge_grubu,
          durum: r.durum,
          posta_kodu: r.posta_kodu,
          musteri_grubu: r.musteri_grubu,
          guncellendi: ts,
        };
        if (r.lat != null && r.lon != null) {
          base.lat = r.lat;
          base.lon = r.lon;
          base.geocode_kaynak = r.geocode_kaynak;
          base.geocode_hassasiyet = r.geocode_hassasiyet;
        } else if (!existing.has(r.musteri_kodu)) {
          base.lat = null;
          base.lon = null;
          base.geocode_kaynak = r.geocode_kaynak;
          base.geocode_hassasiyet = r.geocode_hassasiyet;
        }
        return base;
      });

      await upsertBatch(admin, payloads);

      result = {
        tip,
        islenenSatir: parsed.islenenSatir,
        yeniMusteri: yeni,
        guncellenenMusteri: guncellenen,
        geocodeBasarisiz: geocoded.basarisiz,
        eslesmeyenMusteriKodlari: [],
        dedupUyari: parsed.dedupUyari,
        uyarilar: uyarilar.length ? uyarilar : undefined,
      };
    } else if (tip === "RutTanimListesi") {
      const parsed = parseRutTanimListesi(workbook.rows);
      const codes = parsed.rows.map((r) => r.musteri_kodu);
      const existing = await fetchExistingCodes(admin, codes);
      const eslesen = parsed.rows.filter((r) => existing.has(r.musteri_kodu));
      const eslesmeyen = parsed.rows
        .filter((r) => !existing.has(r.musteri_kodu))
        .map((r) => r.musteri_kodu);

      await updateByMusteriKodu(
        admin,
        eslesen.map((r) => ({
          musteri_kodu: r.musteri_kodu,
          rut_kod: r.rut_kod,
          rut_aciklama: r.rut_aciklama,
          ziyaret_sira: r.ziyaret_sira,
        }))
      );

      if (eslesmeyen.length) {
        uyarilar.push(
          `${eslesmeyen.length} musteri_kodu tabloda yok — önce MusteriListesi yükleyin.`
        );
      }

      result = {
        tip,
        islenenSatir: parsed.islenenSatir,
        yeniMusteri: 0,
        guncellenenMusteri: eslesen.length,
        geocodeBasarisiz: 0,
        eslesmeyenMusteriKodlari: eslesmeyen,
        uyarilar: uyarilar.length ? uyarilar : undefined,
      };
    } else {
      // SevkiyatRaporuKup
      const parsed = parseSevkiyatRaporuKup(workbook.rows);
      if (parsed.tarihBozuk > 0) {
        uyarilar.push(`${parsed.tarihBozuk} satırda BelgeTarihi parse edilemedi.`);
      }

      const codes = parsed.rows.map((r) => r.musteri_kodu);
      const existing = await fetchExistingCodes(admin, codes);
      const eslesen = parsed.rows.filter((r) => existing.has(r.musteri_kodu));
      const eslesmeyen = parsed.rows
        .filter((r) => !existing.has(r.musteri_kodu))
        .map((r) => r.musteri_kodu);

      await updateByMusteriKodu(
        admin,
        eslesen.map((r) => ({
          musteri_kodu: r.musteri_kodu,
          son_teslimat_tarihi: r.son_teslimat_tarihi,
          ilk_teslimat_tarihi: r.ilk_teslimat_tarihi,
          toplam_teslimat_sayisi: r.toplam_teslimat_sayisi,
          toplam_agirlik: r.toplam_agirlik,
          toplam_tutar: r.toplam_tutar,
          son_teslimattan_gecen_gun: r.son_teslimattan_gecen_gun,
        }))
      );

      if (eslesmeyen.length) {
        uyarilar.push(
          `${eslesmeyen.length} musteri_kodu tabloda yok — sevkiyat alanları atlandı.`
        );
      }

      result = {
        tip,
        islenenSatir: parsed.islenenSatir,
        yeniMusteri: 0,
        guncellenenMusteri: eslesen.length,
        geocodeBasarisiz: 0,
        eslesmeyenMusteriKodlari: eslesmeyen,
        uyarilar: uyarilar.length ? uyarilar : undefined,
      };
    }

    const log = await kaydetYuklemeLogu(admin, {
      dosyaAdi: file.name,
      dosyaTipi: tip,
      dosyaBoyutu: file.size,
      result,
    });

    result.yuklemeId = log.id;
    result.yuklenmeZamani = log.yuklenmeZamani;
    result.dosyaAdi = file.name;

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    console.error("[api/upload]", err);
    return jsonError(message, 500);
  }
}
