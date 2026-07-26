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
