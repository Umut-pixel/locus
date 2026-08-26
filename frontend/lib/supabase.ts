import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil. " +
      "Repo kökündeki .env dosyasını kontrol edip 'npm run sync-env' (veya npm run dev) çalıştırın."
  );
}

/**
 * Sadece anon key kullanır — RLS ile korunan `musteriler_harita` view'ından
 * salt okunur veri çeker. service_role anahtarı bu dosyada YOK ve olmamalı.
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});

/** Harita katmani — yalnizca koordinati olan musteriler (lat/lon dolu). */
export const MUSTERILER_HARITA_VIEW = "musteriler_harita";
/**
 * Raporlama katmani — TUM musteriler, koordinat sarti yok.
 * `musteriler_harita` bunun uzerine kurulu filtreli bir view; risk ve net ciro
 * mantigi tek yerde (bkz. sql/raporlama_view_koordinatsiz.sql). Rapor ekrani
 * harita view'ini okudugunda koordinatsiz musterilerin cirosu toplama
 * girmiyordu (2026-08-18'de 12 musteri / 240.626,08 TL).
 */
export const MUSTERILER_RAPOR_VIEW = "musteriler_rapor";
/**
 * Master'da kaydı olmadığı için ekrana girmeyen cironun mutabakat
 * satırı (agregat: müşteri adedi + tutar). Kapsamı değiştirmez, farkı görünür
 * kılar — bkz. sql/rapor_bolge_disi_ozet.sql.
 */
export const RAPOR_BOLGE_DISI_OZET_VIEW = "rapor_bolge_disi_ozet";
export const MUSTERI_METRIK_GECMIS_TABLE = "musteri_metrik_gecmis";
export const POTANSIYEL_MUSTERILER_HARITA_VIEW = "potansiyel_musteriler_harita";
export const MUSTERI_SNAPSHOTLARI_TABLE = "musteri_snapshotlari";
export const PANORAMA_SYNC_RUNS_TABLE = "panorama_sync_runs";
export const YUKLEME_LOGLARI_TABLE = "yukleme_loglari";
export const PANORAMA_SYNC_DOSYA_TIPI = "PanoramaSync";
export const PANORAMA_ACIK_FATURA_VADE_KUP_VIEW =
  "v_panorama_acik_fatura_vade_kup_guncel";
export const PANORAMA_DETAYLI_STOK_RAPORU_VIEW =
  "v_panorama_detayli_stok_raporu_guncel";
/** BelgeDetayRaporu (5450) satır bazlı — ciro trendi, temsilci/ürün grubu kırılımı. */
export const PANORAMA_BELGE_DETAY_VIEW = "v_panorama_belge_detay_raporu_guncel";
/** SevkiyatRaporuKup (5130) satır bazlı — plaka/araç ve ödeme tipi kırılımı. */
export const PANORAMA_SEVKIYAT_VIEW = "v_panorama_sevkiyat_raporu_kup_guncel";
/**
 * Sipariş Durum Raporu (5140) satır bazlı — sipariş kalemi + fulfillment
 * durumu (`bekleyen_siparis`: "Bekleyen Sipariş" / "İrsaliyeleştirildi" /
 * "Faturalaştırıldı"). Günlük çekiliyor ama hiçbir view sabitine/UI'a bağlı
 * değildi (2026-08-20 keşfi) — bkz. Sevkiyat Raporları "Bekleyen Siparişler" paneli.
 */
export const PANORAMA_SIPARIS_DURUM_VIEW =
  "v_panorama_siparis_durum_raporu_guncel";
/**
 * Ürün SKT / parti kayıtları — Panorama'dan DEĞİL, fabrikanın 15 günde bir
 * gönderdiği alış raporundan (Veri Yükle akışı). Otomatik tazelenmez;
 * ekranda kapsanan tarih aralığı bu yüzden açıkça gösteriliyor.
 * bkz. sql/urun_skt_sema.sql
 */
export const URUN_SKT_TABLE = "urun_skt";
