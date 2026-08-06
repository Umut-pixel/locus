import type { SupabaseClient } from "@supabase/supabase-js";

import type { BelgeOzetUpdateRow } from "@/lib/import/types";
import { MUSTERI_BELGE_OZET_TABLE } from "@/lib/supabase-admin";

const BATCH = 250;

function nowIso() {
  return new Date().toISOString();
}

/** Belge özeti tablosunu tam snapshot ile değiştir (delete-all + insert). */
export async function replaceBelgeOzet(
  admin: SupabaseClient,
  rows: BelgeOzetUpdateRow[]
): Promise<void> {
  const { error: delError } = await admin
    .from(MUSTERI_BELGE_OZET_TABLE)
    .delete()
    .not("musteri_kodu", "is", null);
  if (delError) {
    throw new Error(`Belge özeti temizliği başarısız: ${delError.message}`);
  }

  const ts = nowIso();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({
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
      guncellendi: ts,
    }));
    const { error } = await admin.from(MUSTERI_BELGE_OZET_TABLE).insert(chunk);
    if (error) {
      throw new Error(`Belge özeti yazılamadı: ${error.message}`);
    }
  }
}
