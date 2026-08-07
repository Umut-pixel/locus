import type { SupabaseClient } from "@supabase/supabase-js";

import type { YaslandirmaUpdateRow } from "@/lib/import/types";

/**
 * Yaşlandırma tablosunu tam snapshot ile değiştir.
 * DELETE + INSERT tek Postgres RPC transaction'ında.
 */
export async function replaceYaslandirma(
  admin: SupabaseClient,
  rows: YaslandirmaUpdateRow[]
): Promise<void> {
  const payload = rows.map((r) => ({
    musteri_kodu: r.musteri_kodu,
    st: r.st,
    hf_01_06: r.hf_01_06,
    hf_07_13: r.hf_07_13,
    hf_14_20: r.hf_14_20,
    hf_21_27: r.hf_21_27,
    hf_28_34: r.hf_28_34,
    hf_35_41: r.hf_35_41,
    hf_42_48: r.hf_42_48,
    hf_49_55: r.hf_49_55,
    hf_56_62: r.hf_56_62,
    hf_63_69: r.hf_63_69,
    hf_70_ustu: r.hf_70_ustu,
    toplam: r.toplam,
    riskli_tutar: r.riskli_tutar,
    borc_riskli: r.borc_riskli,
  }));

  const { error } = await admin.rpc("replace_musteri_yaslandirma", {
    p_rows: payload,
  });
  if (error) {
    throw new Error(`Yaşlandırma snapshot RPC başarısız: ${error.message}`);
  }
}
