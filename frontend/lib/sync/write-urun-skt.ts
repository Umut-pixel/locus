import type { SupabaseClient } from "@supabase/supabase-js";

import type { SktKaynak, UrunSktUpdateRow } from "@/lib/import/types";
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

/** Bir kaynağın tabloda kaç ürünü var — "diğer kaynak korundu" uyarısı için. */
export async function sktKaynakSayimi(
  admin: SupabaseClient,
  kaynak: SktKaynak
): Promise<number> {
  const { data, error } = await admin
    .from("urun_skt")
    .select("urun_kodu")
    .eq("kaynak", kaynak);
  if (error) return 0;
  return new Set((data ?? []).map((r) => (r as { urun_kodu: string }).urun_kodu))
    .size;
}

/**
 * Ürün kodlarının kataloğu (5430) — sayım föyü kodu kendisi taşıdığı için
 * ad eşleştirmesine gerek yok, yalnızca "bu kod katalogda var mı" sorusu var.
 */
export async function fetchUrunKodlari(
  admin: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await admin
    .from(PANORAMA_DETAYLI_STOK_RAPORU_VIEW)
    .select("urun_kodu");
  if (error) {
    throw new Error(`Ürün kataloğu okunamadı: ${error.message}`);
  }
  const set = new Set<string>();
  for (const row of (data ?? []) as { urun_kodu: string | null }[]) {
    if (row.urun_kodu) set.add(String(row.urun_kodu).trim());
  }
  return set;
}

/**
 * Tek KAYNAĞIN SKT satırlarını tam snapshot ile değiştirir (DELETE + INSERT
 * tek transaction). Tarihçe tutulmuyor — bu bir stok anlık görüntüsü.
 *
 * Diğer kaynağa DOKUNMAZ: fabrika alış dosyası ile depo sayım föyü birbirini
 * tamamlıyor, biri diğerinin yerine geçmiyor (bkz. sql/urun_skt_kaynak_ayrimi.sql).
 *
 * `kaynak` satırlardan türetilmiyor, çağıran açıkça geçiyor — boş bir dosya
 * yüklendiğinde hangi kümenin silineceği satırlara bakılarak anlaşılamaz.
 */
export async function replaceUrunSkt(
  admin: SupabaseClient,
  rows: UrunSktUpdateRow[],
  kaynak: SktKaynak
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
    // kaynak satırda değil RPC parametresinde — silinen küme ile yazılan küme
    // aynı olmalı.
    depo_stok: r.depo_stok,
    parti_miktar: r.parti_miktar,
  }));

  const { data, error } = await admin.rpc("replace_urun_skt", {
    p_rows: payload,
    p_kaynak: kaynak,
  });
  if (error) {
    throw new Error(
      `SKT snapshot RPC başarısız: ${error.message}. ` +
        "sql/urun_skt_sema.sql, urun_skt_depo_sayim.sql ve urun_skt_kaynak_ayrimi.sql Supabase'de çalıştırıldı mı?"
    );
  }
  return typeof data === "number" ? data : rows.length;
}
