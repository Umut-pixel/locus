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
 * Sipariş Durum Raporu (5140) — snapshot landing. guncel view son completed
 * 5140. Bekleyen tutar = BrutTutar (iskonto ve KDV hariç).
 */
export const PANORAMA_SIPARIS_DURUM_VIEW =
  "v_panorama_siparis_durum_raporu_guncel";
/**
 * BelgeDetayRaporu sipariş kanalı (Panorama 5450 / sync_runs 5451).
 * Tam snapshot: guncel view son completed çekim. Kimlik = siparis_no.
 * Bekleyen sipariş paneli ve finansal KPI buradan okur (`brut_tutar` =
 * 5140 BrutTutar; `nettutar` burada GenelToplam / KDV dahil).
 */
export const PANORAMA_SIPARIS_DETAY_VIEW =
  "v_panorama_siparis_detay_raporu_guncel";
/**
 * TahsilatRaporu (5230) satır bazlı — nakit girişi defteri, fatura cirosu değil.
 * PII kolonları (tc_kimlik_no, vergi_no) UI SELECT'ine girmez.
 */
export const PANORAMA_TAHSILAT_VIEW = "v_panorama_tahsilat_raporu_guncel";
/**
 * Ürün SKT / parti kayıtları — Panorama'dan DEĞİL, fabrikanın 15 günde bir
 * gönderdiği alış raporundan (Veri Yükle akışı). Otomatik tazelenmez;
 * ekranda kapsanan tarih aralığı bu yüzden açıkça gösteriliyor.
 * bkz. sql/urun_skt_sema.sql
 */
export const URUN_SKT_TABLE = "urun_skt";
/**
 * SKU paket ölçüsü — kg / koli içi adet / çuval eşdeğeri. Ürün adından parse
 * edilip elle düzeltilir (kaynak='manuel' satırlar seed'de korunur).
 * bkz. sql/urun_olcu_sema.sql
 */
export const URUN_OLCU_TABLE = "urun_olcu";
/**
 * Bekleyen siparişi olan müşteriler + kg/çuval yükü — rota planlayıcısının
 * TEK kaynağı. kg/hacim matematiği view'da; uygulamada tekrarlanmaz.
 * Koordinatsız müşteri lat/lon NULL ile gelir, sessizce düşmez.
 * bkz. sql/siparis_yuk_view.sql
 */
export const MUSTERI_BEKLEYEN_YUK_VIEW = "v_musteri_bekleyen_yuk";
/**
 * Aynı hesabın tarih penceresi parametreli hâli: `musteri_bekleyen_yuk(p_gun)`.
 * p_gun = null → filtre yok. Panorama'nın kendi penceresi 9 ay olduğu için
 * filtresiz havuzda aylardır bekleyen sipariş de görünür.
 * bkz. sql/siparis_yuk_view.sql
 */
export const BEKLEYEN_YUK_RPC = "musteri_bekleyen_yuk";
/**
 * Filo tanımı. Panorama'da araç verisi YOK (1.979 sevk belgesinin hepsi aynı
 * sahte plaka '35AAA3535'), bu yüzden tek kaynak bu tablo.
 * bkz. sql/araclar_sema.sql
 */
export const ARACLAR_TABLE = "araclar";
/**
 * Şoför kadrosu. Günlük araç sayısını filo değil BU tablo sınırlıyor.
 * Ehliyet KAPSAYICI: C tüm araçları sürer, B yalnız Kangoo/Transit. Pratikte
 * günde en fazla 3 araç ve en fazla 2 Isuzu.
 * bkz. sql/soforler_sema.sql
 */
export const SOFORLER_TABLE = "soforler";
