/**
 * Canlı araç konumu — Arvento GPS.
 *
 * Kaynak: `v_arac_konum_son` view'ı. n8n (`backend/n8n/Arvento Arac Takibi.json`)
 * mesai içinde dakikada bir, dışında 15 dakikada bir yazıyor.
 *
 * Neden view: Arvento'nun `lastEvents` ucu YALNIZ cihaz node'u döndürüyor —
 * plaka, sürücü ve kontak bilgisi yok (o alanları veren `lastEventsIgnition` /
 * `lastEventsV2` uçları sözleşmemizde kapalı). Plaka `arvento_araclar`'dan
 * join ediliyor, `hareket` (hız > 0) ve `bayat` (10 dk) view'da türetiliyor.
 * Bu modül hiçbirini yeniden hesaplamaz — CLAUDE.md'deki "risk hesabı view'da,
 * uygulama kodunda tekrarlanmaz" ilkesinin aynısı.
 *
 * `yasSaniye` bunun tek istisnası: view'ın verdiği değer ÇEKİM ANINDA doğru,
 * ekranda saniye saniye eskiyor. Ekranda gösterilen yaş bu yüzden
 * `olcumZamani`'ndan canlı hesaplanır — bu bir kural değil, zaman damgasının
 * okunması. Bayatlık EŞİĞİ yine view'ın işi.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { sayi, sayiVeyaNull } from "@/lib/rota/veri";
import { ARAC_KONUM_VIEW } from "@/lib/supabase";

const KOLONLAR =
  "node,plaka,surucu,arac_sinifi,arac_kod,arac_adi,olcum_zamani," +
  "lat,lon,hiz_kmh,yon_derece,odometre_km,adres,hareket,bayat,yas_saniye";

export interface CanliAracKonumuRaw {
  node: string;
  plaka: string;
  surucu: string | null;
  arac_sinifi: string | null;
  arac_kod: string | null;
  arac_adi: string | null;
  olcum_zamani: string;
  lat: number | string;
  lon: number | string;
  hiz_kmh: number | string | null;
  yon_derece: number | string | null;
  odometre_km: number | string | null;
  adres: string | null;
  hareket: boolean | null;
  bayat: boolean | null;
  yas_saniye: number | string | null;
}

export interface CanliAracKonumu {
  /** Arvento cihaz id'si — satırın kimliği. */
  node: string;
  /** Normalize plaka (büyük harf, boşluksuz). */
  plaka: string;
  surucu: string | null;
  /** Arvento'nun sınıfı: "OTOMOBIL" / "KAMYON". Model bilgisi yok. */
  aracSinifi: string | null;
  /** `araclar(kod)` eşlemesi — ELLE doldurulur, çoğu araçta null. */
  aracKod: string | null;
  /** Eşlenmişse rota aracının adı (ör. "Isuzu 3D"). */
  aracAdi: string | null;
  /** Cihazın konumu ürettiği an (ISO). n8n TR yerel saatinden çevirdi. */
  olcumZamani: string;
  lat: number;
  lon: number;
  hizKmh: number | null;
  /** Pusula yönü, 0-360 derece. Kuzey = 0. */
  yonDerece: number | null;
  odometreKm: number | null;
  adres: string | null;
  /** Hız > 0. View'da türetiliyor. */
  hareket: boolean;
  /** Ölçüm 10 dakikadan eski. Eşik view'da tanımlı. */
  bayat: boolean;
}

export function konumaCevir(r: CanliAracKonumuRaw): CanliAracKonumu {
  return {
    node: r.node,
    plaka: r.plaka,
    surucu: r.surucu,
    aracSinifi: r.arac_sinifi,
    aracKod: r.arac_kod,
    aracAdi: r.arac_adi,
    olcumZamani: r.olcum_zamani,
    lat: sayi(r.lat),
    lon: sayi(r.lon),
    hizKmh: sayiVeyaNull(r.hiz_kmh),
    yonDerece: sayiVeyaNull(r.yon_derece),
    odometreKm: sayiVeyaNull(r.odometre_km),
    adres: r.adres,
    hareket: r.hareket === true,
    bayat: r.bayat === true,
  };
}

/**
 * Ölçümün ŞU ANKİ yaşı (saniye). View'ın `yas_saniye`'si çekim anında
 * doğruydu; ekranda tazelik göstergesi bununla tiklenir.
 * Bozuk zaman damgası null'a düşer — "bilmiyorum" gösterilir, 0 değil.
 */
export function yasSaniye(konum: CanliAracKonumu, simdi = Date.now()): number | null {
  const t = Date.parse(konum.olcumZamani);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((simdi - t) / 1000));
}

/** "42 sn", "6 dk", "2 sa 15 dk" — tazelik rozeti metni. */
export function yasMetni(saniye: number | null): string {
  if (saniye == null) return "bilinmiyor";
  if (saniye < 60) return `${saniye} sn`;
  const dk = Math.floor(saniye / 60);
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  return `${sa} sa ${dk % 60} dk`;
}

export async function canliKonumCek(
  client: SupabaseClient
): Promise<CanliAracKonumu[]> {
  const { data, error } = await client
    .from(ARAC_KONUM_VIEW)
    .select(KOLONLAR)
    .order("plaka", { ascending: true })
    .returns<CanliAracKonumuRaw[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map(konumaCevir);
}

/** `arac_kod` → konum. Eşlenmemiş araçlar (çoğu) bu haritaya girmez. */
export function aracKoduylaEslestir(
  konumlar: CanliAracKonumu[]
): Map<string, CanliAracKonumu> {
  const m = new Map<string, CanliAracKonumu>();
  for (const k of konumlar) {
    if (k.aracKod) m.set(k.aracKod, k);
  }
  return m;
}
