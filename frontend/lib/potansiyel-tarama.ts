import { istanbulIsoGun } from "@/lib/donem";

/**
 * Haritadan il seçilerek başlatılan Google Places taraması — istemci/sunucu
 * ortak sabitleri ve satır izleme döngüsü.
 *
 * ⚠️ Buradaki sabitler `app/api/potansiyel/tarama/route.ts` ile **aynı
 * kaynaktan** okunur (route da bu dosyayı import eder). Ayrışırlarsa düğme
 * "hazır" görünürken sunucu 429 döner — `lib/panorama-manual-sync.ts:11-14`
 * aynı tuzağı bir kez yaşadı.
 *
 * Elle eşleşmesi gereken üç eşik:
 *   1. TARAMA_DEADLINE_MS (burada, tarayıcı vazgeçme süresi)
 *   2. sweep_stale_potansiyel_taramalari p_threshold (sql/potansiyel_tarama_stale_sweep.sql)
 *   3. potansiyel_tarama_stale_sweep cron kadansı (aynı dosya)
 * Tarayıcı 40 dk'da vazgeçer, süpürücü en geç 50 dk'da satırı 'failed' yapar;
 * arada toast "zaman aşımı" derken satır hâlâ 'running' görünebilir — beklenen.
 */

export const POTANSIYEL_TARAMALARI_TABLE = "potansiyel_taramalari";

/** Günde kaç tarama. Kota Europe/Istanbul gece yarısı sıfırlanır. */
export const GUNLUK_TARAMA_LIMITI = 2;

/**
 * n8n `Config.skipDays` varsayılanıyla aynı: bir ilçe son bu kadar gün içinde
 * tarandıysa yeniden taranmaz. Önizlemedeki "taze ilçe" sayımı da bunu kullanır
 * ve route bu değeri webhook gövdesinde n8n'e gönderir — böylece önizleme ile
 * gerçek atlama kararı kanıtlanabilir biçimde aynı olur.
 */
export const TARAMA_SKIP_DAYS = 25;

/** n8n `Config.maxCells` sigortası — tek koşuda üretilecek azami hücre. */
export const TARAMA_MAX_CELLS = 600;

export const TARAMA_POLL_MS = 15_000;
export const TARAMA_DEADLINE_MS = 40 * 60 * 1000;

export const TARAMA_STORAGE_KEY = "locus:potansiyel-tarama-aktif";

export type TaramaDurumu = "running" | "completed" | "failed";

export type TaramaOzeti = {
  placeTotal?: number;
  newPlaceCount?: number;
  existingPlaceCount?: number;
  markedScanned?: number;
  skippedDistrictCount?: number;
  queuedDistrictCount?: number;
  nearbyHttp429?: number;
  placesApiErrorCount?: number;
  clippedDistrictCount?: number;
  atlananIlceSayisi?: number;
  ilFiltresi?: string | null;
  skipAll?: boolean;
  message?: string;
};

export type TaramaSatiri = {
  id: string;
  il: string;
  plaka: number;
  durum: TaramaDurumu;
  baslatildiAt: string;
  tamamlandiAt: string | null;
  yeniPotansiyelSayisi: number | null;
  tarananIlceSayisi: number | null;
  planlananIlceSayisi: number | null;
  hata: string | null;
  ozet: TaramaOzeti | null;
};

export type TaramaKotasi = {
  limit: number;
  kullanilan: number;
  kalan: number;
  gun: string;
  sifirlanmaIso: string;
};

export type IlOnBilgi = {
  plaka: number;
  ad: string;
  kapsamVar: boolean;
  ilceSayisi: number;
  koordinatsizSayisi: number;
  yogunIlceSayisi: number;
  tazeIlceSayisi: number;
  taranacakIlceSayisi: number;
  sonTarama: string | null;
  tahminiCagri: { alt: number; ust: number };
  tahminiSureDk: { alt: number; ust: number };
  uyari: "kapsam_yok" | "koordinat_yok" | "hepsi_taze" | "kismi_taze" | null;
};

export type TaramaOnizleme = {
  kota: TaramaKotasi;
  calisan: { id: string; il: string; plaka: number; baslatildiAt: string } | null;
  sonTaramalar: TaramaSatiri[];
  il?: IlOnBilgi;
};

/**
 * Kotanın sıfırlanacağı an: bir sonraki Europe/Istanbul gece yarısı, ISO UTC.
 *
 * Türkiye 2016'dan beri kalıcı UTC+3 (yaz saati uygulaması kaldırıldı), bu
 * yüzden sabit ofsetle hesaplamak güvenli — ve `istanbulIsoGun` zaten gün
 * sınırını doğru veriyor, iki kaynak ayrışamaz.
 */
export function istanbulGunSonuIso(now: Date = new Date()): string {
  const [y, m, d] = istanbulIsoGun(now).split("-").map(Number);
  const ertesiGunUtc = Date.UTC(y!, m! - 1, d! + 1, 0, 0, 0);
  return new Date(ertesiGunUtc - 3 * 60 * 60 * 1000).toISOString();
}

export function kalanSureMetni(sifirlanmaIso: string, now: Date = new Date()): string {
  const kalanMs = new Date(sifirlanmaIso).getTime() - now.getTime();
  if (!Number.isFinite(kalanMs) || kalanMs <= 0) return "birazdan";
  const dk = Math.ceil(kalanMs / 60_000);
  if (dk < 60) return `${dk} dakika`;
  const saat = Math.floor(dk / 60);
  const artik = dk % 60;
  return artik > 0 ? `${saat} saat ${artik} dakika` : `${saat} saat`;
}

type HamSatir = Record<string, unknown>;

export function satirDonustur(row: HamSatir): TaramaSatiri {
  const durum = String(row.durum ?? "running");
  return {
    id: String(row.id ?? ""),
    il: String(row.il ?? ""),
    plaka: Number(row.plaka ?? 0),
    durum: (durum === "completed" || durum === "failed" ? durum : "running") as TaramaDurumu,
    baslatildiAt: String(row.baslatildi_at ?? ""),
    tamamlandiAt: row.tamamlandi_at == null ? null : String(row.tamamlandi_at),
    yeniPotansiyelSayisi:
      row.yeni_potansiyel_sayisi == null ? null : Number(row.yeni_potansiyel_sayisi),
    tarananIlceSayisi:
      row.taranan_ilce_sayisi == null ? null : Number(row.taranan_ilce_sayisi),
    planlananIlceSayisi:
      row.planlanan_ilce_sayisi == null ? null : Number(row.planlanan_ilce_sayisi),
    hata: row.hata == null ? null : String(row.hata),
    ozet: (row.ozet as TaramaOzeti | null) ?? null,
  };
}

/**
 * Tahmini Google çağrısı aralığı — n8n `Build Nearby Cells` mantığını
 * birebir yansıtır. Yoğun ilçe 4 hücre + 3 Text, seyrek ilçe 1 hücre.
 * Üst sınır: her hücrenin kırpılıp iki pass derinleşmesi (1 + 4 + 16 = 21x).
 */
export function cagriTahmini(
  tarananSeyrek: number,
  tarananYogun: number,
  maxCells: number = TARAMA_MAX_CELLS
): { alt: number; ust: number } {
  const nearbyAlt = Math.min(tarananSeyrek * 1 + tarananYogun * 4, maxCells);
  const text = tarananYogun * 3;
  return { alt: nearbyAlt + text, ust: nearbyAlt * 21 + text };
}

const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tek bir tarama satırını bitene kadar izler.
 *
 * `izleRaporCekimi` (panorama) rapor id'leri üzerinden fan-out yapıyor;
 * burada tek satır var, bu yüzden döngü çok daha basit. Tarayıcıdan **anon
 * key** ile okunuyor — tablo select'e açık, yazma service-role'de
 * (bkz. sql/potansiyel_tarama_sema.sql).
 */
export async function izleTarama(
  runId: string,
  basladiAt: number,
  onIlerleme?: (satir: TaramaSatiri) => void
): Promise<TaramaSatiri> {
  // Dinamik import bilerek: bu modülü `app/api/potansiyel/tarama/route.ts` de
  // (sabitler + tahmin için) import ediyor. Statik import olsaydı sunucu
  // route'u tarayıcı anon client'ını kurmaya çalışır ve NEXT_PUBLIC_* yoksa
  // modül yüklenirken patlardı — testler de aynı nedenle çalışmazdı.
  const { supabase } = await import("@/lib/supabase");
  const deadline = basladiAt + TARAMA_DEADLINE_MS;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from(POTANSIYEL_TARAMALARI_TABLE)
      .select(
        "id,il,plaka,durum,baslatildi_at,tamamlandi_at,yeni_potansiyel_sayisi,taranan_ilce_sayisi,planlanan_ilce_sayisi,hata,ozet"
      )
      .eq("id", runId)
      .maybeSingle();

    if (error) {
      throw new Error(`Tarama durumu okunamadı: ${error.message}`);
    }
    if (!data) {
      // Route n8n hatasında satırı siler; poll o yarışa denk gelebilir.
      throw new Error("Tarama kaydı bulunamadı (tetikleme başarısız olmuş olabilir).");
    }

    const satir = satirDonustur(data as HamSatir);
    onIlerleme?.(satir);
    if (satir.durum !== "running") return satir;

    await uyu(TARAMA_POLL_MS);
  }

  throw new Error("Tarama zaman aşımına uğradı. n8n execution loguna bakın.");
}
