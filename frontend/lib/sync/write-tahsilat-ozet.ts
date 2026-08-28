import type { SupabaseClient } from "@supabase/supabase-js";

import type { TahsilatOzetUpdateRow } from "@/lib/import/types";

/**
 * Tahsilat özeti tablosunu tam snapshot ile değiştir.
 * DELETE + INSERT tek Postgres RPC transaction'ında.
 */
export async function replaceTahsilatOzet(
  admin: SupabaseClient,
  rows: TahsilatOzetUpdateRow[]
): Promise<void> {
  const payload = rows.map((r) => ({
    musteri_kodu: r.musteri_kodu,
    son_tahsilat_tarihi: r.son_tahsilat_tarihi,
    tahsilat_7g: r.tahsilat_7g,
    tahsilat_30g: r.tahsilat_30g,
    tahsilat_ytd: r.tahsilat_ytd,
    odenmemis_tutar: r.odenmemis_tutar,
    odenmemis_adet: r.odenmemis_adet,
    satir_sayisi: r.satir_sayisi,
  }));

  const { error } = await admin.rpc("replace_musteri_tahsilat_ozet", {
    p_rows: payload,
  });
  if (error) {
    throw new Error(`Tahsilat özeti snapshot RPC başarısız: ${error.message}`);
  }
}
