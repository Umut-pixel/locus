import { NextResponse } from "next/server";

import { istanbulIsoGun } from "@/lib/donem";
import { gecerliPlaka, ilAdi } from "@/lib/iller";
import {
  cagriTahmini,
  GUNLUK_TARAMA_LIMITI,
  istanbulGunSonuIso,
  kalanSureMetni,
  POTANSIYEL_TARAMALARI_TABLE,
  satirDonustur,
  TARAMA_MAX_CELLS,
  TARAMA_SKIP_DAYS,
  type IlOnBilgi,
  type TaramaKotasi,
} from "@/lib/potansiyel-tarama";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Haritadan il seçilerek başlatılan Google Places taraması.
 *
 * ⚠️ Bu yol BİLEREK `middleware.ts` içindeki AGENT_WRITABLE_PATHS listesine
 * EKLENMEDİ. O listenin kendi doktrini (middleware.ts:14-27) `/api/rota/optimize`'ı
 * Google'da para harcadığı için dışarıda tutuyor; burası aynısını tek çağrıda
 * 10-800 katı hacimde yapıyor. Yalnız oturum korumalı kalmalı.
 */

const HEADER_SECRET = "X-N8N-Sync-Secret";
const ILCE_MERKEZLERI_TABLE = "ilce_merkezleri";
const YOGUN_KEY = "yoğun_bolge";

/**
 * Haftalık cron `0 6 * * 3` (Çarşamba 06:00) çalışırken manuel tarama
 * kabul edilmez. Cron koşusu `potansiyel_taramalari`'na satır yazmıyor, yani
 * in-flight kilidi onu göremiyor; n8n'de `$getWorkflowStaticData('global')`
 * workflow başına olduğu için iki eşzamanlı koşu birbirinin placesById /
 * scannedDistricts'ini ezer ve yanlış ilçelere son_tarama yazar.
 * Kalıcı çözüm cron yoluna da run satırı açmak (bkz. plan, Seçenek B).
 */
const CRON_PENCERE = { gun: 3, baslangicSaat: 6, bitisSaat: 8 } as const;

function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function istanbulParcalari(now: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    f.formatToParts(now).map((p) => [p.type, p.value])
  );
  const gunler: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    gun: gunler[String(parts.weekday)] ?? -1,
    saat: Number(parts.hour),
  };
}

function cronPenceresinde(now: Date = new Date()): boolean {
  const { gun, saat } = istanbulParcalari(now);
  return (
    gun === CRON_PENCERE.gun &&
    saat >= CRON_PENCERE.baslangicSaat &&
    saat < CRON_PENCERE.bitisSaat
  );
}

type IlceSatiri = {
  ilce: string;
  lat: number | null;
  son_tarama: string | null;
  yogun: boolean;
};

async function ilceleriOku(
  admin: ReturnType<typeof createSupabaseAdmin>,
  il: string
): Promise<IlceSatiri[]> {
  // `select("*")`: kolon adı `yoğun_bolge` (Türkçe ğ) — supabase-js alias
  // söz dizimiyle uğraşmak yerine tüm satırı çekip JS'te okuyoruz. n8n
  // `Fetch Ilce Merkezleri` de aynı nedenle `select=*` kullanıyor.
  const { data, error } = await admin
    .from(ILCE_MERKEZLERI_TABLE)
    .select("*")
    .eq("il", il)
    .limit(2000);

  if (error) throw new Error(`ilce_merkezleri okunamadı: ${error.message}`);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    ilce: String(r.ilce ?? ""),
    lat: r.lat == null ? null : Number(r.lat),
    son_tarama: r.son_tarama == null ? null : String(r.son_tarama),
    yogun: Boolean(r[YOGUN_KEY] ?? r.yogun_bolge),
  }));
}

function onBilgiHesapla(plaka: number, ad: string, satirlar: IlceSatiri[]): IlOnBilgi {
  const skipMs = TARAMA_SKIP_DAYS * 24 * 60 * 60 * 1000;
  const simdi = Date.now();

  let koordinatsiz = 0;
  let taze = 0;
  let tarananSeyrek = 0;
  let tarananYogun = 0;
  let yogunToplam = 0;
  let sonTarama: string | null = null;

  for (const r of satirlar) {
    if (r.yogun) yogunToplam += 1;
    if (r.son_tarama) {
      if (!sonTarama || r.son_tarama > sonTarama) sonTarama = r.son_tarama;
    }
    if (r.lat == null) {
      koordinatsiz += 1;
      continue;
    }
    const t = r.son_tarama ? new Date(r.son_tarama).getTime() : NaN;
    if (Number.isFinite(t) && simdi - t < skipMs) {
      taze += 1;
      continue;
    }
    if (r.yogun) tarananYogun += 1;
    else tarananSeyrek += 1;
  }

  const taranacak = tarananSeyrek + tarananYogun;
  const tahmin = cagriTahmini(tarananSeyrek, tarananYogun);

  // Sıra önemli: "taranacak ilçe yok"un iki farklı sebebi var ve kullanıcıya
  // yanlışını söylemek kafa karıştırır — hepsi koordinatsızsa "hepsi taze"
  // demek, veriyi düzeltmek yerine beklemeye yönlendirirdi.
  let uyari: IlOnBilgi["uyari"] = null;
  if (satirlar.length === 0) uyari = "kapsam_yok";
  else if (taranacak === 0 && taze === 0) uyari = "koordinat_yok";
  else if (taranacak === 0) uyari = "hepsi_taze";
  else if (taze > 0) uyari = "kismi_taze";

  return {
    plaka,
    ad,
    kapsamVar: satirlar.length > 0,
    ilceSayisi: satirlar.length,
    koordinatsizSayisi: koordinatsiz,
    yogunIlceSayisi: yogunToplam,
    tazeIlceSayisi: taze,
    taranacakIlceSayisi: taranacak,
    sonTarama,
    tahminiCagri: tahmin,
    // ~4 istek/sn hedefli pacing (n8n batchInterval 250ms) + node döngü payı.
    tahminiSureDk: {
      alt: Math.max(1, Math.round(tahmin.alt / 60)),
      ust: Math.max(2, Math.round(tahmin.ust / 60)),
    },
    uyari,
  };
}

async function kotaOku(
  admin: ReturnType<typeof createSupabaseAdmin>,
  now: Date
): Promise<TaramaKotasi> {
  const gun = istanbulIsoGun(now);
  // durum filtresi YOK: başarısız/süpürülmüş koşu da hakkı yakar. Satır yalnız
  // n8n tetiği kabul ettiyse var, yani Google'da para harcanmış demektir.
  // Tek istisna "satır açıldı, n8n patladı" — orada satır siliniyor.
  const { count, error } = await admin
    .from(POTANSIYEL_TARAMALARI_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("istanbul_gunu", gun);

  if (error) throw new Error(`Kota okunamadı: ${error.message}`);

  const kullanilan = count ?? 0;
  return {
    limit: GUNLUK_TARAMA_LIMITI,
    kullanilan,
    kalan: Math.max(0, GUNLUK_TARAMA_LIMITI - kullanilan),
    gun,
    sifirlanmaIso: istanbulGunSonuIso(now),
  };
}

async function calisanOku(admin: ReturnType<typeof createSupabaseAdmin>) {
  // Zaman kesiti YOK — ölüye karar veren tek merci pg_cron süpürücüsü
  // (sql/potansiyel_tarama_stale_sweep.sql). Panorama'daki STALE_LOCK_MS
  // deseni burada eşzamanlı koşuya kapı açardı.
  const { data, error } = await admin
    .from(POTANSIYEL_TARAMALARI_TABLE)
    .select("id,il,plaka,baslatildi_at")
    .eq("durum", "running")
    .order("baslatildi_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Çalışan tarama okunamadı: ${error.message}`);
  const satir = data?.[0];
  if (!satir) return null;
  return {
    id: String(satir.id),
    il: String(satir.il),
    plaka: Number(satir.plaka),
    baslatildiAt: String(satir.baslatildi_at),
  };
}

async function oturumVar(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  return typeof appMeta.kullanici_adi === "string"
    ? appMeta.kullanici_adi
    : (user.email?.split("@")[0] ?? null);
}

// ---------------------------------------------------------------- GET

/**
 * Önizleme — yan etkisiz. POST reddedilecek olsa bile **her zaman 200** döner
 * ki arayüz sebebi (kota doldu / hepsi taze / kapsam yok) kartta gösterebilsin.
 */
export async function GET(request: Request) {
  try {
    const admin = createSupabaseAdmin();
    const now = new Date();
    const url = new URL(request.url);
    const plakaHam = url.searchParams.get("plaka");

    const [kota, calisan, sonHam] = await Promise.all([
      kotaOku(admin, now),
      calisanOku(admin),
      admin
        .from(POTANSIYEL_TARAMALARI_TABLE)
        .select("*")
        .order("baslatildi_at", { ascending: false })
        .limit(5),
    ]);

    if (sonHam.error) {
      throw new Error(`Son taramalar okunamadı: ${sonHam.error.message}`);
    }

    const govde: Record<string, unknown> = {
      kota,
      calisan,
      sonTaramalar: (sonHam.data ?? []).map((r) =>
        satirDonustur(r as Record<string, unknown>)
      ),
    };

    if (plakaHam != null) {
      const plaka = Number(plakaHam);
      const ad = gecerliPlaka(plaka) ? ilAdi(plaka) : null;
      if (!ad) {
        return jsonError("Geçersiz il (plaka 1-81 olmalı).", 400);
      }
      govde.il = onBilgiHesapla(plaka, ad, await ilceleriOku(admin, ad));
    }

    return NextResponse.json(govde);
  } catch (err) {
    console.error("[api/potansiyel/tarama] GET", err);
    const message =
      err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    return jsonError(message, 500);
  }
}

// ---------------------------------------------------------------- POST

export async function POST(request: Request) {
  let admin: ReturnType<typeof createSupabaseAdmin>;
  let runId = "";

  try {
    const kullanici = await oturumVar();
    admin = createSupabaseAdmin();

    // 2 — yapılandırma
    const webhookUrl = process.env.N8N_POTANSIYEL_TARAMA_WEBHOOK_URL?.trim() ?? "";
    const webhookSecret =
      process.env.N8N_POTANSIYEL_TARAMA_WEBHOOK_SECRET?.trim() ?? "";
    if (!webhookUrl || !webhookSecret) {
      return jsonError("Potansiyel taraması henüz yapılandırılmadı.", 503);
    }
    // 3 — test URL'si
    if (/\/webhook-test\//i.test(webhookUrl)) {
      return jsonError(
        "Test webhook URL’si kullanılıyor. n8n’de Production URL kopyala (Listen kapalıyken test 404 verir).",
        400
      );
    }

    // 4 — girdi
    let ham: { plaka?: unknown } = {};
    try {
      const metin = await request.text();
      if (metin.trim()) ham = JSON.parse(metin);
    } catch {
      return jsonError("Geçersiz JSON.", 400);
    }
    const plaka = Number(ham.plaka);
    const il = gecerliPlaka(plaka) ? ilAdi(plaka) : null;
    if (!il) {
      return jsonError("Geçersiz il (plaka 1-81 olmalı).", 400);
    }

    // 5 — kapsam + tazelik verisi (tek okuma, hem guard hem plan kolonları)
    const satirlar = await ilceleriOku(admin, il);
    const onBilgi = onBilgiHesapla(plaka, il, satirlar);
    if (!onBilgi.kapsamVar) {
      return jsonError(
        `${il} için ilçe merkezi kaydı yok; önce seed çalıştırılmalı (backend/geocode_ilce_merkezleri.py).`,
        409,
        { kod: "kapsam_yok" }
      );
    }

    // 6 — in-flight
    const calisan = await calisanOku(admin);
    if (calisan) {
      return jsonError(
        `Bir tarama zaten çalışıyor (${calisan.il}). Bitmesini bekleyin.`,
        409,
        { kod: "calisiyor", calisan }
      );
    }

    // 7 — haftalık cron penceresi
    const now = new Date();
    if (cronPenceresinde(now)) {
      return jsonError(
        "Haftalık otomatik tarama penceresi (Çarşamba 06:00-08:00); 08:00’den sonra tekrar deneyin.",
        409,
        { kod: "cron_penceresi" }
      );
    }

    // 8 — günlük kota
    const kota = await kotaOku(admin, now);
    if (kota.kalan <= 0) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((new Date(kota.sifirlanmaIso).getTime() - now.getTime()) / 1000)
      );
      return jsonError(
        `Günlük tarama hakkı doldu (${kota.kullanilan}/${kota.limit}). ${kalanSureMetni(
          kota.sifirlanmaIso,
          now
        )} sonra yenilenir.`,
        429,
        { kod: "kota", kota, retryAfterSec }
      );
    }

    // 9 — taranacak ilçe yok (iki ayrı sebep)
    if (onBilgi.uyari === "koordinat_yok") {
      return jsonError(
        `${il} için koordinatı çözülmüş ilçe yok (${onBilgi.koordinatsizSayisi} ilçenin tamamı geocode edilememiş).`,
        409,
        { kod: "koordinat_yok", il: onBilgi }
      );
    }
    if (onBilgi.taranacakIlceSayisi === 0) {
      return jsonError(
        `${il}’in ${onBilgi.ilceSayisi} ilçesinin tamamı son ${TARAMA_SKIP_DAYS} günde tarandı.`,
        409,
        { kod: "hepsi_taze", il: onBilgi }
      );
    }

    // --- satırı ÖNCE aç: çift tık yarışını 6 ve 8'de kapatır
    runId = crypto.randomUUID();
    const { error: insertError } = await admin
      .from(POTANSIYEL_TARAMALARI_TABLE)
      .insert({
        id: runId,
        il,
        plaka,
        kaynak: "manuel",
        tetikleyen: kullanici,
        durum: "running",
        istanbul_gunu: istanbulIsoGun(now),
        planlanan_ilce_sayisi: onBilgi.taranacakIlceSayisi,
        taze_ilce_sayisi: onBilgi.tazeIlceSayisi,
        koordinatsiz_ilce_sayisi: onBilgi.koordinatsizSayisi,
        tahmini_cagri_alt: onBilgi.tahminiCagri.alt,
        tahmini_cagri_ust: onBilgi.tahminiCagri.ust,
      });

    if (insertError) {
      throw new Error(`Tarama kaydı açılamadı: ${insertError.message}`);
    }

    // --- n8n tetiği
    const n8nHeaders: Record<string, string> = {
      [HEADER_SECRET]: webhookSecret,
      Authorization: `Bearer ${webhookSecret}`,
      Accept: "application/json",
    };
    const signal = AbortSignal.timeout(15_000);
    const govde = {
      source: "locus-potansiyel",
      runId,
      il,
      plaka,
      skipDays: String(TARAMA_SKIP_DAYS),
      maxCells: TARAMA_MAX_CELLS,
    };

    let res = await fetch(webhookUrl, {
      method: "POST",
      headers: { ...n8nHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(govde),
      signal,
    });

    if (res.status === 404) {
      const preview = (await res.text().catch(() => "")).slice(0, 280);
      if (/not registered for POST|GET request/i.test(preview)) {
        // GET yedeği gövde taşıyamaz; Guard düğümü query'den de okuyor.
        const yedekUrl = new URL(webhookUrl);
        for (const [k, v] of Object.entries(govde)) {
          yedekUrl.searchParams.set(k, String(v));
        }
        res = await fetch(yedekUrl, { method: "GET", headers: n8nHeaders, signal });
      } else {
        console.error("[api/potansiyel/tarama] n8n", 404, preview);
        await satiriSil(admin, runId);
        return jsonError(
          "n8n webhook bulunamadı. Production URL ve workflow’un aktif olduğunu kontrol et.",
          502
        );
      }
    }

    if (!res.ok) {
      const preview = (await res.text().catch(() => "")).slice(0, 280);
      console.error("[api/potansiyel/tarama] n8n", res.status, preview);
      await satiriSil(admin, runId);
      if (res.status === 404) {
        return jsonError(
          "n8n webhook hâlâ GET kayıtlı. Authentication=None ve Method=POST yapıp workflow’u kapatıp aç.",
          502
        );
      }
      if (res.status === 401 || res.status === 403) {
        return jsonError(
          "n8n Header Auth reddetti. Webhook Authentication = None olmalı; sır Guard Tarama Secret düğümünde X-N8N-Sync-Secret ile kontrol edilir.",
          502
        );
      }
      return jsonError(`n8n tetiklenemedi (HTTP ${res.status}).`, 502);
    }

    return NextResponse.json({
      ok: true,
      runId,
      il,
      plaka,
      taranacakIlceSayisi: onBilgi.taranacakIlceSayisi,
      tazeIlceSayisi: onBilgi.tazeIlceSayisi,
      koordinatsizSayisi: onBilgi.koordinatsizSayisi,
      tahminiCagri: onBilgi.tahminiCagri,
      tahminiSureDk: onBilgi.tahminiSureDk,
      kota: { ...kota, kullanilan: kota.kullanilan + 1, kalan: kota.kalan - 1 },
    });
  } catch (err) {
    console.error("[api/potansiyel/tarama] POST", err);
    if (runId) {
      try {
        await satiriSil(createSupabaseAdmin(), runId);
      } catch {
        /* temizlik başarısızsa süpürücü devralır */
      }
    }
    const message =
      err instanceof Error ? err.message : "Beklenmeyen sunucu hatası.";
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      return jsonError("n8n yanıt vermedi.", 504);
    }
    return jsonError(message, 500);
  }
}

/**
 * Tetikleme başarısızsa satır SİLİNİR, 'failed' işaretlenmez.
 * Gerekçe: satırın varlığı "Google'da para harcandı" demek ve günlük hakkı
 * yakıyor. n8n'e hiç ulaşamamış bir denemenin hak yakmaması gerek; ayrı bir
 * `sayilmaz` bayrağı tutmak kota sorgusunu ve süpürücüyü karmaşıklaştırırdı.
 */
async function satiriSil(
  admin: ReturnType<typeof createSupabaseAdmin>,
  runId: string
) {
  const { error } = await admin
    .from(POTANSIYEL_TARAMALARI_TABLE)
    .delete()
    .eq("id", runId);
  if (error) {
    console.error("[api/potansiyel/tarama] satır silinemedi", runId, error.message);
  }
}
