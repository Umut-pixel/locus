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
      "SUPABASE_SERVICE_KEY (veya SUPABASE_SERVICE_ROLE_KEY) ve NEXT_PUBLIC_SUPABASE_URL tanımlı değil."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const MUSTERILER_TABLE = "musteriler";
