import type { SupabaseClient } from "@supabase/supabase-js";

import type { UrunSktUpdateRow } from "@/lib/import/types";
import { PANORAMA_DETAYLI_STOK_RAPORU_VIEW } from "@/lib/supabase";

/**
 * Ürün adı normalize — dosya ile katalog arasındaki tek fark boşluk/noktalama
 * ("15kg" vs "15 kg"). 2026-08-21 ölçümü: 84/84 ürün bu normalizasyonla
 * birebir eşleşti, fuzzy eşleştirmeye gerek kalmadı.
 */
export function normalizeUrunAdi(ad: string): string {
  return ad
    .replace(/İ/g, "I")
    .toLocaleUpperCase("tr-TR")
    .replace(/[.,()]/g, " ")
    .replace(/(\d+)\s*(KG|GR|LT|KL|ML)\b/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stok kataloğundan `normalize(urun) -> urun_kodu` haritası.
 *
 * Katalog kaynağı bilinçli olarak Detaylı Stok Raporu (5430): SKT rozeti
 * zaten o ekranda gösterilecek, dolayısıyla orada olmayan bir ürünün kodunu
 * çözmek bir işe yaramıyor.
 */
export async function fetchUrunKatalogu(
  admin: SupabaseClient
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from(PANORAMA_DETAYLI_STOK_RAPORU_VIEW)
    .select("urun_kodu,urun");
  if (error) {
    throw new Error(`Ürün kataloğu okunamadı: ${error.message}`);
  }

  const map = new Map<string, string>();
  for (const row of (data ?? []) as { urun_kodu: string | null; urun: string | null }[]) {
    if (!row.urun_kodu || !row.urun) continue;
    const key = normalizeUrunAdi(row.urun);
    // İlk gelen kazanır — aynı ada sahip iki kod olursa sessizce değişmesin.
    if (!map.has(key)) map.set(key, row.urun_kodu);
  }
  return map;
}

/**
 * SKT tablosunu tam snapshot ile değiştir (DELETE + INSERT tek transaction).
 * Tarihçe tutulmuyor — bu bir stok anlık görüntüsü, en güncel sayım doğru olan.
 */
export async function replaceUrunSkt(
  admin: SupabaseClient,
  rows: UrunSktUpdateRow[]
): Promise<number> {
  const payload = rows.map((r) => ({
    urun_kodu: r.urun_kodu,
    urun_adi: r.urun_adi,
    matbu_no: r.matbu_no,
    islem_tarihi: r.islem_tarihi,
    satir_miktar: r.satir_miktar,
    parti_no: r.parti_no,
    skt_tarihi: r.skt_tarihi,
    durum: r.durum,
    tek_parti: r.tek_parti,
  }));

  const { data, error } = await admin.rpc("replace_urun_skt", {
    p_rows: payload,
  });
  if (error) {
    throw new Error(
      `SKT snapshot RPC başarısız: ${error.message}. ` +
        "sql/urun_skt_sema.sql Supabase'de çalıştırıldı mı?"
    );
  }
  return typeof data === "number" ? data : rows.length;
}
