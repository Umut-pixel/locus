import type { SupabaseClient } from "@supabase/supabase-js";

import { geocodeEksikler } from "@/lib/import/geocode";
import { parseBelgeDetayRaporu } from "@/lib/import/parse-belge-detay";
import { parseMusteriListesi } from "@/lib/import/parse-musteri";
import { parseRutTanimListesi } from "@/lib/import/parse-rut";
import { parseSevkiyatRaporuKup } from "@/lib/import/parse-sevkiyat";
import type { MusteriUpsertRow } from "@/lib/import/types";
import {
  MUSTERILER_TABLE,
  YUKLEME_LOGLARI_TABLE,
} from "@/lib/supabase-admin";

import {
  PANORAMA_BELGE_DETAY_VIEW,
  PANORAMA_MUSTERI_VIEW,
  PANORAMA_RUT_VIEW,
  PANORAMA_SEVKIYAT_VIEW,
  PANORAMA_YASLANDIRMA_VIEW,
  PANORAMA_SYNC_DOSYA_TIPI,
  fetchAllFromView,
  fetchLastPanoramaTransformMeta,
  fetchLatestCompletedSyncs,
} from "./fetch-panorama";
import {
  panoramaBelgeDetayToExcelRows,
  panoramaMusteriToExcelRows,
  panoramaRutToExcelRows,
  panoramaSevkiyatToExcelRows,
} from "./panorama-to-rows";
import { parseYaslandirma5530 } from "./parse-yaslandirma-5530";
import type { PanoramaSyncIds, PanoramaTransformResult } from "./types";
import { replaceBelgeOzet } from "./write-belge-ozet";
import { replaceYaslandirma } from "./write-yaslandirma";

const BATCH = 250;
/** Nominatim rate limit — cron 300s içinde kalsın */
const MAX_GEOCODE_PER_RUN = 80;

function nowIso() {
  return new Date().toISOString();
}

async function fetchExistingCodes(
  admin: SupabaseClient,
  codes: string[]
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < codes.length; i += BATCH) {
    const chunk = codes.slice(i, i + BATCH);
    const { data, error } = await admin
      .from(MUSTERILER_TABLE)
      .select("musteri_kodu")
      .in("musteri_kodu", chunk);
    if (error) {
      throw new Error(`Mevcut müşteri sorgusu başarısız: ${error.message}`);
    }
    for (const row of data ?? []) {
      existing.add(row.musteri_kodu as string);
    }
  }
  return existing;
}

/**
 * PostgREST upsert dizisinde eksik anahtarlar null sayılır — lat olan ve
 * olmayan satırları aynı chunk’ta gönderme (koordinat silinir).
 */
async function upsertBatch(
  admin: SupabaseClient,
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

async function updateByMusteriKodu(
  admin: SupabaseClient,
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

function syncIdsEqual(
  a: Record<string, string | null> | null,
  b: PanoramaSyncIds
): boolean {
  if (!a) return false;
  return (
    a["5020"] === b["5020"] &&
    a["5500"] === b["5500"] &&
    a["5130"] === b["5130"] &&
    (a["5450"] ?? null) === b["5450"] &&
    (a["5530"] ?? null) === b["5530"]
  );
}

const EMPTY_YASLANDIRMA: PanoramaTransformResult["yaslandirma"] = {
  skipped: true,
  islenenSatir: 0,
  yazilan: 0,
  eslesmeyen: 0,
  bilinmeyenHafta: 0,
  toplamAtlanan: 0,
};

const EMPTY_BELGE_OZET: PanoramaTransformResult["belgeOzet"] = {
  skipped: true,
  islenenSatir: 0,
  yazilan: 0,
  eslesmeyen: 0,
};

export interface RunTransformOptions {
  force?: boolean;
  /** Test / acil — Nominatim atla */
  skipGeocode?: boolean;
  /** Varsayılan MAX_GEOCODE_PER_RUN; kurtarma için yükselt */
  geocodeLimit?: number;
}

export async function runPanoramaTransform(
  admin: SupabaseClient,
  options: RunTransformOptions = {}
): Promise<PanoramaTransformResult> {
  const uyarilar: string[] = [];
  const syncs = await fetchLatestCompletedSyncs(admin);

  for (const id of [5020, 5500, 5130] as const) {
    if (!syncs.has(id)) {
      throw new Error(
        `Rapor ${id} için tamamlanmış panorama_sync_runs satırı yok.`
      );
    }
  }

  const syncIds: PanoramaSyncIds = {
    "5020": syncs.get(5020)!.id,
    "5500": syncs.get(5500)!.id,
    "5130": syncs.get(5130)!.id,
    "5450": syncs.get(5450)?.id ?? null,
    "5530": syncs.get(5530)?.id ?? null,
  };

  const last = await fetchLastPanoramaTransformMeta(admin);
  if (!options.force && syncIdsEqual(last.syncIds, syncIds)) {
    return {
      skipped: true,
      reason: "Aynı sync seti zaten uygulanmış.",
      syncIds,
      musteri: {
        islenenSatir: 0,
        yazilan: 0,
        yeni: 0,
        guncellenen: 0,
        bolgeDisi: 0,
        geocodeBasarisiz: 0,
        geocodeAtlanan: 0,
        dedupUyari: false,
      },
      rut: { islenenSatir: 0, guncellenen: 0, eslesmeyen: 0 },
      sevkiyat: {
        islenenSatir: 0,
        guncellenen: 0,
        eslesmeyen: 0,
        tarihBozuk: 0,
      },
      belgeOzet: { ...EMPTY_BELGE_OZET },
      yaslandirma: { ...EMPTY_YASLANDIRMA },
      uyarilar: [],
    };
  }

  // --- 5020 Müşteri ---
  const rawMusteri = await fetchAllFromView(admin, PANORAMA_MUSTERI_VIEW);
  const parsedMusteri = parseMusteriListesi(
    panoramaMusteriToExcelRows(rawMusteri)
  );
  if (parsedMusteri.dedupUyari) {
    uyarilar.push(
      `Dedup uyarısı: ST dışında farklılaşan kolonlar (${parsedMusteri.farklilasanKolonlar.join(", ")}).`
    );
  }
  if (parsedMusteri.bolgeDisi > 0) {
    uyarilar.push(
      `${parsedMusteri.bolgeDisi} müşteri çekirdek 8 il dışında — dahil edildi.`
    );
  }

  const codes = parsedMusteri.rows.map((r) => r.musteri_kodu);
  const existing = await fetchExistingCodes(admin, codes);

  let geocodeBasarisiz = 0;
  let geocodeAtlanan = 0;
  let rowsForWrite: MusteriUpsertRow[] = parsedMusteri.rows;

  // Mevcut DB lat — ERP yoksa korumak / geocode adayları için
  const existingLat = new Map<string, { lat: number; lon: number }>();
  {
    const needLookup = codes.filter((c) => existing.has(c));
    for (let i = 0; i < needLookup.length; i += BATCH) {
      const chunk = needLookup.slice(i, i + BATCH);
      const { data, error } = await admin
        .from(MUSTERILER_TABLE)
        .select("musteri_kodu, lat, lon")
        .in("musteri_kodu", chunk);
      if (error) {
        throw new Error(`Mevcut koordinat sorgusu başarısız: ${error.message}`);
      }
      for (const row of data ?? []) {
        const lat = row.lat as number | null;
        const lon = row.lon as number | null;
        if (lat != null && lon != null) {
          existingLat.set(row.musteri_kodu as string, { lat, lon });
        }
      }
    }
  }

  if (!options.skipGeocode) {
    // ERP yok + DB’de de yok → geocode (cache hit hızlı; Nominatim limitli)
    const needGeocode = parsedMusteri.rows.filter((r) => {
      if (r.lat != null && r.lon != null) return false;
      return !existingLat.has(r.musteri_kodu);
    });
    const limit = options.geocodeLimit ?? MAX_GEOCODE_PER_RUN;
    const toGeocode = needGeocode.slice(0, limit);
    geocodeAtlanan = Math.max(0, needGeocode.length - toGeocode.length);

    if (toGeocode.length > 0) {
      const geocoded = await geocodeEksikler(toGeocode);
      geocodeBasarisiz = geocoded.basarisiz;
      const byKod = new Map(geocoded.rows.map((r) => [r.musteri_kodu, r]));
      rowsForWrite = parsedMusteri.rows.map(
        (r) => byKod.get(r.musteri_kodu) ?? r
      );
    }

    if (geocodeAtlanan > 0) {
      uyarilar.push(
        `${geocodeAtlanan} müşteri geocode kuyruğu sonraki koşuya bırakıldı (limit ${limit}/koşu).`
      );
    }
  }

  const yeni = codes.filter((c) => !existing.has(c)).length;
  const guncellenen = codes.length - yeni;

  const payloads = rowsForWrite.map((r) => {
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
      // Yeni satır — koordinat yok
      base.lat = null;
      base.lon = null;
      base.geocode_kaynak = r.geocode_kaynak;
      base.geocode_hassasiyet = r.geocode_hassasiyet;
    }
    // Mevcut + ERP yok: lat bilerek gönderilmez (korunur). Upsert chunk’ları
    // lat’li/lat’siz ayrılır — PostgREST eksik anahtarı null yapmasın.
    return base;
  });

  await upsertBatch(admin, payloads);

  // --- 5500 Rut ---
  const rawRut = await fetchAllFromView(admin, PANORAMA_RUT_VIEW);
  const parsedRut = parseRutTanimListesi(panoramaRutToExcelRows(rawRut));
  const rutCodes = parsedRut.rows.map((r) => r.musteri_kodu);
  const rutExisting = await fetchExistingCodes(admin, rutCodes);
  const rutEslesen = parsedRut.rows.filter((r) =>
    rutExisting.has(r.musteri_kodu)
  );
  const rutEslesmeyen = parsedRut.rows.length - rutEslesen.length;

  await updateByMusteriKodu(
    admin,
    rutEslesen.map((r) => ({
      musteri_kodu: r.musteri_kodu,
      rut_kod: r.rut_kod,
      rut_aciklama: r.rut_aciklama,
      ziyaret_sira: r.ziyaret_sira,
    }))
  );

  if (rutEslesmeyen > 0) {
    uyarilar.push(
      `${rutEslesmeyen} rut satırı musteri_kodu tabloda yok — atlandı.`
    );
  }

  // --- 5130 Sevkiyat (kümülatif) ---
  const rawSevk = await fetchAllFromView(admin, PANORAMA_SEVKIYAT_VIEW);
  const parsedSevk = parseSevkiyatRaporuKup(
    panoramaSevkiyatToExcelRows(rawSevk)
  );
  if (parsedSevk.tarihBozuk > 0) {
    uyarilar.push(
      `${parsedSevk.tarihBozuk} sevkiyat satırında BelgeTarihi parse edilemedi.`
    );
  }

  const sevkCodes = parsedSevk.rows.map((r) => r.musteri_kodu);
  const sevkExisting = await fetchExistingCodes(admin, sevkCodes);
  const sevkEslesen = parsedSevk.rows.filter((r) =>
    sevkExisting.has(r.musteri_kodu)
  );
  const sevkEslesmeyen = parsedSevk.rows.length - sevkEslesen.length;

  await updateByMusteriKodu(
    admin,
    sevkEslesen.map((r) => ({
      musteri_kodu: r.musteri_kodu,
      son_teslimat_tarihi: r.son_teslimat_tarihi,
      ilk_teslimat_tarihi: r.ilk_teslimat_tarihi,
      toplam_teslimat_sayisi: r.toplam_teslimat_sayisi,
      toplam_agirlik: r.toplam_agirlik,
      toplam_tutar: r.toplam_tutar,
      son_teslimattan_gecen_gun: r.son_teslimattan_gecen_gun,
    }))
  );

  if (sevkEslesmeyen > 0) {
    uyarilar.push(
      `${sevkEslesmeyen} sevkiyat müşterisi tabloda yok — atlandı.`
    );
  }

  // --- 5450 Belge detay özeti (opsiyonel) ---
  let belgeOzetResult: PanoramaTransformResult["belgeOzet"] = {
    ...EMPTY_BELGE_OZET,
  };
  let rawBelgeLength = 0;

  if (!syncIds["5450"]) {
    uyarilar.push(
      "Rapor 5450 için tamamlanmış sync yok — belge özeti atlandı."
    );
  } else {
    const rawBelge = await fetchAllFromView(admin, PANORAMA_BELGE_DETAY_VIEW);
    rawBelgeLength = rawBelge.length;
    const parsedBelge = parseBelgeDetayRaporu(
      panoramaBelgeDetayToExcelRows(rawBelge)
    );
    const belgeCodes = parsedBelge.rows.map((r) => r.musteri_kodu);
    const belgeExisting = await fetchExistingCodes(admin, belgeCodes);
    const belgeEslesen = parsedBelge.rows.filter((r) =>
      belgeExisting.has(r.musteri_kodu)
    );
    const belgeEslesmeyen = parsedBelge.rows.length - belgeEslesen.length;

    await replaceBelgeOzet(admin, belgeEslesen);

    if (belgeEslesmeyen > 0) {
      uyarilar.push(
        `${belgeEslesmeyen} belge özeti müşterisi tabloda yok — atlandı.`
      );
    }

    belgeOzetResult = {
      skipped: false,
      islenenSatir: parsedBelge.islenenSatir,
      yazilan: belgeEslesen.length,
      eslesmeyen: belgeEslesmeyen,
    };
  }

  // --- 5530 Yaşlandırma (opsiyonel — cron yoksa atla) ---
  let yaslandirmaResult: PanoramaTransformResult["yaslandirma"] = {
    ...EMPTY_YASLANDIRMA,
  };
  let rawYasLength = 0;

  if (!syncIds["5530"]) {
    uyarilar.push(
      "Rapor 5530 için tamamlanmış sync yok — yaşlandırma atlandı."
    );
  } else {
    const rawYas = await fetchAllFromView(admin, PANORAMA_YASLANDIRMA_VIEW);
    rawYasLength = rawYas.length;
    const parsedYas = parseYaslandirma5530(rawYas);
    const yasCodes = parsedYas.rows.map((r) => r.musteri_kodu);
    const yasExisting = await fetchExistingCodes(admin, yasCodes);
    const yasEslesen = parsedYas.rows.filter((r) =>
      yasExisting.has(r.musteri_kodu)
    );
    const yasEslesmeyen = parsedYas.rows.length - yasEslesen.length;

    await replaceYaslandirma(admin, yasEslesen);

    if (yasEslesmeyen > 0) {
      uyarilar.push(
        `${yasEslesmeyen} yaşlandırma müşterisi tabloda yok — atlandı.`
      );
    }
    if (parsedYas.bilinmeyenHafta > 0) {
      uyarilar.push(
        `${parsedYas.bilinmeyenHafta} yaşlandırma satırında bilinmeyen gün bandı — atlandı.`
      );
    }

    yaslandirmaResult = {
      skipped: false,
      islenenSatir: parsedYas.islenenSatir,
      yazilan: yasEslesen.length,
      eslesmeyen: yasEslesmeyen,
      bilinmeyenHafta: parsedYas.bilinmeyenHafta,
      toplamAtlanan: parsedYas.toplamAtlanan,
    };
  }

  const dosyaAdi = `panorama-sync-${syncIds["5020"].slice(0, 8)}`;
  const { data: log, error: logError } = await admin
    .from(YUKLEME_LOGLARI_TABLE)
    .insert({
      dosya_adi: dosyaAdi,
      dosya_tipi: PANORAMA_SYNC_DOSYA_TIPI,
      dosya_boyutu_byte: null,
      islenen_satir:
        parsedMusteri.islenenSatir +
        parsedRut.islenenSatir +
        parsedSevk.islenenSatir +
        belgeOzetResult.islenenSatir +
        yaslandirmaResult.islenenSatir,
      yeni_musteri: yeni,
      guncellenen_musteri:
        guncellenen +
        rutEslesen.length +
        sevkEslesen.length +
        belgeOzetResult.yazilan +
        yaslandirmaResult.yazilan,
      geocode_basarisiz: geocodeBasarisiz,
      eslesmeyen_kod_sayisi:
        rutEslesmeyen +
        sevkEslesmeyen +
        belgeOzetResult.eslesmeyen +
        yaslandirmaResult.eslesmeyen,
      uyarilar: {
        messages: uyarilar,
        sync_ids: syncIds,
        report_counts: {
          musteri: rawMusteri.length,
          rut: rawRut.length,
          sevkiyat: rawSevk.length,
          belge: rawBelgeLength,
          yaslandirma: rawYasLength,
        },
      },
      durum: "ok",
      karsilastirma: null,
    })
    .select("id, yuklenme_zamani")
    .single();

  if (logError || !log) {
    throw new Error(
      `Yükleme logu yazılamadı: ${logError?.message ?? "bilinmeyen"}`
    );
  }

  return {
    skipped: false,
    syncIds,
    musteri: {
      islenenSatir: parsedMusteri.islenenSatir,
      yazilan: codes.length,
      yeni,
      guncellenen,
      bolgeDisi: parsedMusteri.bolgeDisi,
      geocodeBasarisiz,
      geocodeAtlanan,
      dedupUyari: parsedMusteri.dedupUyari,
    },
    rut: {
      islenenSatir: parsedRut.islenenSatir,
      guncellenen: rutEslesen.length,
      eslesmeyen: rutEslesmeyen,
    },
    sevkiyat: {
      islenenSatir: parsedSevk.islenenSatir,
      guncellenen: sevkEslesen.length,
      eslesmeyen: sevkEslesmeyen,
      tarihBozuk: parsedSevk.tarihBozuk,
    },
    belgeOzet: belgeOzetResult,
    yaslandirma: yaslandirmaResult,
    yuklemeId: log.id as string,
    yuklenmeZamani: log.yuklenme_zamani as string,
    uyarilar,
  };
}
