import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — yalnızca API route'lardan import edin.
 * RLS'i bypass eder; tarayıcıya asla sızmamalı.
 */
export function createSupabaseAdmin(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_KEY ve SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL tanımlı değil. " +
        "Repo kökündeki .env dosyasını kontrol edin (Vercel'de Environment Variables)."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const MUSTERILER_TABLE = "musteriler";
export const YUKLEME_LOGLARI_TABLE = "yukleme_loglari";
export const MUSTERI_SNAPSHOTLARI_TABLE = "musteri_snapshotlari";
export const MUSTERI_YASLANDIRMA_TABLE = "musteri_yaslandirma";
export const MUSTERI_BELGE_OZET_TABLE = "musteri_belge_ozet";
