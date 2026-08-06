import type { SupabaseClient } from "@supabase/supabase-js";

import type { YaslandirmaUpdateRow } from "@/lib/import/types";
import { MUSTERI_YASLANDIRMA_TABLE } from "@/lib/supabase-admin";

const BATCH = 250;

function nowIso() {
  return new Date().toISOString();
}

/** Yaşlandırma tablosunu tam snapshot ile değiştir (delete-all + insert). */
export async function replaceYaslandirma(
  admin: SupabaseClient,
  rows: YaslandirmaUpdateRow[]
): Promise<void> {
  const { error: delError } = await admin
    .from(MUSTERI_YASLANDIRMA_TABLE)
    .delete()
    .not("musteri_kodu", "is", null);
  if (delError) {
    throw new Error(`Yaşlandırma temizliği başarısız: ${delError.message}`);
  }

  const ts = nowIso();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({
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
      guncellendi: ts,
    }));
    const { error } = await admin.from(MUSTERI_YASLANDIRMA_TABLE).insert(chunk);
    if (error) {
      throw new Error(`Yaşlandırma yazılamadı: ${error.message}`);
    }
  }
}
