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

export const MUSTERILER_HARITA_VIEW = "musteriler_harita";
export const POTANSIYEL_MUSTERILER_HARITA_VIEW = "potansiyel_musteriler_harita";
export const MUSTERI_SNAPSHOTLARI_TABLE = "musteri_snapshotlari";
export const PANORAMA_SYNC_RUNS_TABLE = "panorama_sync_runs";
export const YUKLEME_LOGLARI_TABLE = "yukleme_loglari";
export const PANORAMA_SYNC_DOSYA_TIPI = "PanoramaSync";
export const PANORAMA_ACIK_FATURA_VADE_KUP_VIEW =
  "v_panorama_acik_fatura_vade_kup_guncel";
