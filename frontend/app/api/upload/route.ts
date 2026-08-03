import { NextResponse } from "next/server";

import {
  DosyaTipiHatasi,
  detectDosyaTipi,
  geocodeEksikler,
  parseBelgeDetayRaporu,
  parseMusteriListesi,
  parseRutTanimListesi,
  parseSevkiyatRaporuKup,
  parseStYaslandirma,
  readWorkbook,
  type BelgeOzetUpdateRow,
  type DosyaTipi,
  type UploadResult,
  type YaslandirmaUpdateRow,
} from "@/lib/import";
import {
  buildPortfolioForm,
  computeRiskDurumu,
  type SnapshotMetrics,
  type YuklemeKarsilastirma,
} from "@/lib/snapshot-compare";
import {
  MUSTERI_BELGE_OZET_TABLE,
  MUSTERI_SNAPSHOTLARI_TABLE,
  MUSTERI_YASLANDIRMA_TABLE,
  MUSTERILER_TABLE,
  YUKLEME_LOGLARI_TABLE,
  createSupabaseAdmin,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 250;

type Admin = ReturnType<typeof createSupabaseAdmin>;

type MetricRow = {
  musteri_kodu: string;
  toplam_teslimat_sayisi: number;
  toplam_tutar: number;
  toplam_agirlik: number;
  son_teslimattan_gecen_gun: number | null;
  son_teslimat_tarihi: string | null;
};

function toSnapshotMetrics(row: MetricRow): SnapshotMetrics {
  return {
    risk_durumu: computeRiskDurumu(
      row.toplam_teslimat_sayisi ?? 0,
      row.son_teslimattan_gecen_gun
    ),
    toplam_teslimat_sayisi: Number(row.toplam_teslimat_sayisi ?? 0),
    toplam_tutar: Number(row.toplam_tutar ?? 0),
    toplam_agirlik: Number(row.toplam_agirlik ?? 0),
    son_teslimattan_gecen_gun: row.son_teslimattan_gecen_gun,
    son_teslimat_tarihi: row.son_teslimat_tarihi,
  };
}

async function fetchMetricMap(
  admin: Admin,
  codes: string[]
): Promise<Map<string, SnapshotMetrics>> {
  const map = new Map<string, SnapshotMetrics>();
  for (let i = 0; i < codes.length; i += BATCH) {
    const chunk = codes.slice(i, i + BATCH);
    const { data, error } = await admin
      .from(MUSTERILER_TABLE)
      .select(
        "musteri_kodu, toplam_teslimat_sayisi, toplam_tutar, toplam_agirlik, son_teslimattan_gecen_gun, son_teslimat_tarihi"
      )
      .in("musteri_kodu", chunk);
    if (error) {
      throw new Error(`Metrik sorgusu başarısız: ${error.message}`);
    }
    for (const row of (data ?? []) as MetricRow[]) {
      map.set(row.musteri_kodu, toSnapshotMetrics(row));
    }
  }
  return map;
}

async function insertSnapshots(
  admin: Admin,
  yuklemeId: string,
  pairs: Array<{
    musteri_kodu: string;
    onceki: SnapshotMetrics | null;
    yeni: SnapshotMetrics;
  }>
): Promise<void> {
  for (let i = 0; i < pairs.length; i += BATCH) {
    const chunk = pairs.slice(i, i + BATCH).map(({ musteri_kodu, onceki, yeni }) => ({
      yukleme_id: yuklemeId,
      musteri_kodu,
      risk_durumu: yeni.risk_durumu,
      toplam_teslimat_sayisi: yeni.toplam_teslimat_sayisi,
      toplam_tutar: yeni.toplam_tutar,
      toplam_agirlik: yeni.toplam_agirlik,
      son_teslimattan_gecen_gun: yeni.son_teslimattan_gecen_gun,
      son_teslimat_tarihi: yeni.son_teslimat_tarihi,
      onceki_risk_durumu: onceki?.risk_durumu ?? null,
      onceki_toplam_teslimat_sayisi: onceki?.toplam_teslimat_sayisi ?? null,
      onceki_toplam_tutar: onceki?.toplam_tutar ?? null,
      onceki_toplam_agirlik: onceki?.toplam_agirlik ?? null,
      onceki_son_teslimattan_gecen_gun: onceki?.son_teslimattan_gecen_gun ?? null,
      onceki_son_teslimat_tarihi: onceki?.son_teslimat_tarihi ?? null,
    }));
    const { error } = await admin.from(MUSTERI_SNAPSHOTLARI_TABLE).insert(chunk);
    if (error) {
      throw new Error(`Snapshot yazılamadı: ${error.message}`);
    }
  }
}

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

/**
 * PostgREST upsert dizisinde eksik anahtarlar null sayılır — lat olan ve
 * olmayan satırları aynı chunk’ta gönderme (mevcut koordinat silinir).
 */
async function upsertBatch(
  admin: ReturnType<typeof createSupabaseAdmin>,
  rows: Record<string, unknown>[]
): Promise<void> {
  const withLat = rows.filter((r) => "lat" in r);
  const withoutLat = rows.filter((r) => !("lat" in r));

  for (const group of [withLat, withoutLat]) {
    for (let i = 0; i < group.length; i += BATCH) {
      const chunk = group.slice(i, i + BATCH);
      if (chunk.length === 0) continue;
      const { error } = await admin.from(MUSTERILER_TABLE).upsert(chunk, {
        onConflict: "musteri_kodu",
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`Upsert başarısız: ${error.message}`);
    }
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

async function fetchUnvanMap(
  admin: Admin,
  codes: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < codes.length; i += BATCH) {
    const chunk = codes.slice(i, i + BATCH);
    const { data, error } = await admin
      .from(MUSTERILER_TABLE)
      .select("musteri_kodu, unvan")
      .in("musteri_kodu", chunk);
    if (error) {
      throw new Error(`Unvan sorgusu başarısız: ${error.message}`);
    }
    for (const row of data ?? []) {
      map.set(row.musteri_kodu as string, (row.unvan as string) ?? "");
    }
  }
  return map;
}

function normalizeUnvan(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
}

async function replaceYaslandirma(
  admin: Admin,
  rows: YaslandirmaUpdateRow[]
): Promise<void> {
  const { error: delError } = await admin
    .from(MUSTERI_YASLANDIRMA_TABLE)
    .delete()
    .not("musteri_kodu", "is", null);
  if (delError) {
    throw new Error(`Yaşlandırma temizliği başarısız: ${delError.message}`);
  }

  const ts = nowIso();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({
      musteri_kodu: r.musteri_kodu,
      st: r.st,
      hf_01_06: r.hf_01_06,
      hf_07_13: r.hf_07_13,
      hf_14_20: r.hf_14_20,
      hf_21_27: r.hf_21_27,
      hf_28_34: r.hf_28_34,
      hf_35_41: r.hf_35_41,
      hf_42_48: r.hf_42_48,
      hf_49_55: r.hf_49_55,
      hf_56_62: r.hf_56_62,
      hf_63_69: r.hf_63_69,
      hf_70_ustu: r.hf_70_ustu,
      toplam: r.toplam,
      riskli_tutar: r.riskli_tutar,
      borc_riskli: r.borc_riskli,
      guncellendi: ts,
    }));
    const { error } = await admin.from(MUSTERI_YASLANDIRMA_TABLE).insert(chunk);
    if (error) {
      throw new Error(`Yaşlandırma yazılamadı: ${error.message}`);
    }
  }
}

async function replaceBelgeOzet(
  admin: Admin,
  rows: BelgeOzetUpdateRow[]
): Promise<void> {
  const { error: delError } = await admin
    .from(MUSTERI_BELGE_OZET_TABLE)
    .delete()
    .not("musteri_kodu", "is", null);
  if (delError) {
    throw new Error(`Belge özeti temizliği başarısız: ${delError.message}`);
  }

  const ts = nowIso();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({
      musteri_kodu: r.musteri_kodu,
      donem_bas: r.donem_bas,
      donem_bit: r.donem_bit,
      satir_sayisi: r.satir_sayisi,
      siparis_sayisi: r.siparis_sayisi,
      fatura_sayisi: r.fatura_sayisi,
      net_ciro: r.net_ciro,
      brut_ciro: r.brut_ciro,
      iskonto_toplam: r.iskonto_toplam,
      promo_satir: r.promo_satir,
      iptal_satir: r.iptal_satir,
      son_islem_tarihi: r.son_islem_tarihi,
      vade_gunu: r.vade_gunu,
      top_urun_grup: r.top_urun_grup,
      son_urun_grup: r.son_urun_grup,
      top_urun: r.top_urun,
      son_urun: r.son_urun,
      st_adi: r.st_adi,
      st_kodu: r.st_kodu,
      guncellendi: ts,
    }));
    const { error } = await admin.from(MUSTERI_BELGE_OZET_TABLE).insert(chunk);
    if (error) {
      throw new Error(`Belge özeti yazılamadı: ${error.message}`);
    }
  }
}

async function kaydetYuklemeLogu(
  admin: Admin,
  input: {
    dosyaAdi: string;
    dosyaTipi: DosyaTipi;
    dosyaBoyutu: number;
    result: UploadResult;
    karsilastirma?: YuklemeKarsilastirma | null;
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
      karsilastirma: input.karsilastirma ?? null,
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
          guncellendi: nowIso(),
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
        etkilenenMusteriKodlari: codes,
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
        etkilenenMusteriKodlari: eslesen.map((r) => r.musteri_kodu),
        uyarilar: uyarilar.length ? uyarilar : undefined,
      };
    } else if (tip === "StYaslandirma") {
      const parsed = parseStYaslandirma(workbook.rows);
      const codes = parsed.rows.map((r) => r.musteri_kodu);
      const existing = await fetchExistingCodes(admin, codes);
      const eslesen = parsed.rows.filter((r) => existing.has(r.musteri_kodu));
      const eslesmeyen = parsed.rows
        .filter((r) => !existing.has(r.musteri_kodu))
        .map((r) => r.musteri_kodu);

      const unvanMap = await fetchUnvanMap(
        admin,
        eslesen.map((r) => r.musteri_kodu)
      );
      let unvanFark = 0;
      for (const r of eslesen) {
        const dbUnvan = unvanMap.get(r.musteri_kodu);
        if (
          r.unvan &&
          dbUnvan &&
          normalizeUnvan(r.unvan) !== normalizeUnvan(dbUnvan)
        ) {
          unvanFark += 1;
        }
      }
      if (unvanFark > 0) {
        uyarilar.push(
          `${unvanFark} satırda Excel müşteri adı ile veritabanı unvanı farklı — kod ile eşlendi.`
        );
      }

      if (eslesen.length > 0) {
        await replaceYaslandirma(admin, eslesen);
      }

      const riskliSayisi = eslesen.filter((r) => r.borc_riskli).length;
      if (eslesen.length > 0) {
        uyarilar.push(
          `Yaşlandırma snapshot: ${eslesen.length} müşteri, ${riskliSayisi} riskli (56+ hafta).`
        );
      } else {
        uyarilar.push(
          "Eşleşen müşteri yok — mevcut yaşlandırma verisi değiştirilmedi."
        );
      }

      if (eslesmeyen.length) {
        uyarilar.push(
          `${eslesmeyen.length} musteri_kodu tabloda yok — yaşlandırma atlandı.`
        );
      }

      result = {
        tip,
        islenenSatir: parsed.islenenSatir,
        yeniMusteri: 0,
        guncellenenMusteri: eslesen.length,
        geocodeBasarisiz: 0,
        eslesmeyenMusteriKodlari: eslesmeyen,
        etkilenenMusteriKodlari: eslesen.map((r) => r.musteri_kodu),
        uyarilar: uyarilar.length ? uyarilar : undefined,
      };
    } else if (tip === "BelgeDetayRaporu") {
      const parsed = parseBelgeDetayRaporu(workbook.rows);
      const codes = parsed.rows.map((r) => r.musteri_kodu);
      const existing = await fetchExistingCodes(admin, codes);
      const eslesen = parsed.rows.filter((r) => existing.has(r.musteri_kodu));
      const eslesmeyen = parsed.rows
        .filter((r) => !existing.has(r.musteri_kodu))
        .map((r) => r.musteri_kodu);

      if (eslesen.length > 0) {
        await replaceBelgeOzet(admin, eslesen);
      }

      const netToplam = eslesen.reduce((s, r) => s + r.net_ciro, 0);
      if (eslesen.length > 0) {
        uyarilar.push(
          `Belge özeti snapshot: ${eslesen.length} müşteri, ${parsed.islenenSatir} satış satırı, net ₺${Math.round(netToplam).toLocaleString("tr-TR")}.`
        );
      } else {
        uyarilar.push(
          "Eşleşen müşteri yok — mevcut belge özeti değiştirilmedi."
        );
      }

      if (eslesmeyen.length) {
        uyarilar.push(
          `${eslesmeyen.length} musteri_kodu tabloda yok — belge özeti atlandı.`
        );
      }

      result = {
        tip,
        islenenSatir: parsed.islenenSatir,
        yeniMusteri: 0,
        guncellenenMusteri: eslesen.length,
        geocodeBasarisiz: 0,
        eslesmeyenMusteriKodlari: eslesmeyen,
        etkilenenMusteriKodlari: eslesen.map((r) => r.musteri_kodu),
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

      const eslesenKodlari = eslesen.map((r) => r.musteri_kodu);
      const oncekiMap = await fetchMetricMap(admin, eslesenKodlari);

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

      const yeniMap = await fetchMetricMap(admin, eslesenKodlari);
      const pairs = eslesenKodlari.map((kod) => ({
        musteri_kodu: kod,
        onceki: oncekiMap.get(kod) ?? null,
        yeni: yeniMap.get(kod) ?? {
          risk_durumu: computeRiskDurumu(0, null),
          toplam_teslimat_sayisi: 0,
          toplam_tutar: 0,
          toplam_agirlik: 0,
          son_teslimattan_gecen_gun: null,
          son_teslimat_tarihi: null,
        },
      }));
      const karsilastirma = buildPortfolioForm(pairs);

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
        etkilenenMusteriKodlari: eslesenKodlari,
        uyarilar: uyarilar.length ? uyarilar : undefined,
        karsilastirma,
      };

      const log = await kaydetYuklemeLogu(admin, {
        dosyaAdi: file.name,
        dosyaTipi: tip,
        dosyaBoyutu: file.size,
        result,
        karsilastirma,
      });

      await insertSnapshots(admin, log.id, pairs);

      result.yuklemeId = log.id;
      result.yuklenmeZamani = log.yuklenmeZamani;
      result.dosyaAdi = file.name;

      return NextResponse.json(result);
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
