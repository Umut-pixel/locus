import type { SupabaseClient } from "@supabase/supabase-js";

import type { BelgeOzetUpdateRow } from "@/lib/import/types";

/**
 * Belge özeti tablosunu tam snapshot ile değiştir.
 * DELETE + INSERT tek Postgres RPC transaction'ında.
 */
export async function replaceBelgeOzet(
  admin: SupabaseClient,
  rows: BelgeOzetUpdateRow[]
): Promise<void> {
  const payload = rows.map((r) => ({
    musteri_kodu: r.musteri_kodu,
    donem_bas: r.donem_bas,
    donem_bit: r.donem_bit,
    satir_sayisi: r.satir_sayisi,
    siparis_sayisi: r.siparis_sayisi,
    fatura_sayisi: r.fatura_sayisi,
    net_ciro: r.net_ciro,
    brut_ciro: r.brut_ciro,
    iskonto_toplam: r.iskonto_toplam,
    promo_satir: r.promo_satir,
    iptal_satir: r.iptal_satir,
    son_islem_tarihi: r.son_islem_tarihi,
    vade_gunu: r.vade_gunu,
    top_urun_grup: r.top_urun_grup,
    son_urun_grup: r.son_urun_grup,
    top_urun: r.top_urun,
    son_urun: r.son_urun,
    st_adi: r.st_adi,
    st_kodu: r.st_kodu,
  }));

  const { error } = await admin.rpc("replace_musteri_belge_ozet", {
    p_rows: payload,
  });
  if (error) {
    throw new Error(`Belge özeti snapshot RPC başarısız: ${error.message}`);
  }
}
