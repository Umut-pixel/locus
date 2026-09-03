/**
 * Rota verisi — bekleyen sipariş yükü + aktif filo.
 *
 * Bu modül bilerek istemciye bağlı değil: Supabase istemcisini parametre
 * alır. Böylece `useRotaPlani` (tarayıcı, anon key) ve `/api/rota/otomatik`
 * (sunucu, service role) aynı sorguları ve aynı dönüşümleri kullanır —
 * agent'ın kurduğu plan ile ekranda görülen plan ayrışmasın.
 *
 * kg / çuval eşdeğeri hesabı `v_musteri_bekleyen_yuk` view'ında yapılır;
 * burada yalnızca okunur, yeniden hesaplanmaz.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Arac, Durak, EhliyetSinifi, Sofor } from "@/lib/rota/atama";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import type { RiskDurumu } from "@/lib/types";

export const BEKLEYEN_YUK_RPC = "musteri_bekleyen_yuk";
export const ARACLAR_TABLE = "araclar";
export const SOFORLER_TABLE = "soforler";

/** Bekleyen sipariş kanalı (Panorama 5450 / sync_runs 5451) — tazelik rozeti. */
export const ROTA_REPORT_ID = 5451;

const ARAC_KOLONLARI =
  "kod,ad,cuval_kapasite,palet_kapasite,max_kg,max_kg_teyitli," +
  "ehliyet_sinifi,takograf,sira,not_metni";
const SOFOR_KOLONLARI = "kod,ad,ehliyet_sinifi,sira";

export interface BekleyenYukRaw {
  musteri_kodu: string;
  unvan: string;
  ilce: string | null;
  sehir: string | null;
  lat: number | null;
  lon: number | null;
  risk_durumu: string | null;
  siparis_sayisi: number | null;
  satir_sayisi: number | null;
  olcusuz_satir: number | null;
  kg: number | string | null;
  cuval_esdeger: number | string | null;
  brut_tutar: number | string | null;
  en_eski_siparis_tarihi: string | null;
  en_yeni_siparis_tarihi: string | null;
}

export interface AracRaw {
  kod: string;
  ad: string;
  cuval_kapasite: number | null;
  palet_kapasite: number | null;
  max_kg: number | string | null;
  max_kg_teyitli: boolean | null;
  ehliyet_sinifi: string | null;
  takograf: boolean | null;
  sira: number | null;
  not_metni: string | null;
}

export interface SoforRaw {
  kod: string;
  ad: string;
  ehliyet_sinifi: string | null;
  sira: number | null;
}

/**
 * Planlanabilir durak — atama motorunun `Durak`'ı + ekran alanları.
 *
 * Rut alanı YOK: Melih (2026-09-02) "o öylesine yapılmış bir rut, düzenlenecek,
 * şuan bu veriyi dikkate almayalım" dedi. Zaten ölçülmüştü — gün tutarlılığı
 * %10-36, ziyaret sırası TSP alt sınırının 4,5-37 katı.
 */
export interface RotaDuragi extends Durak {
  ilce: string | null;
  sehir: string | null;
  riskDurumu: RiskDurumu | null;
  siparisSayisi: number;
  brutTutar: number;
  /** En eski bekleyen siparişin yaşı (gün). Tarih okunamazsa null. */
  yasGun: number | null;
}

/** Filo satırı — motorun `Arac`'ı + ekran alanları. */
export interface RotaAraci extends Arac {
  paletKapasite: number | null;
  notMetni: string | null;
}

export function sayi(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function sayiVeyaNull(
  value: number | string | null | undefined
): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const RISK_DEGERLERI: ReadonlySet<string> = new Set<RiskDurumu>([
  "saglikli",
  "izlenmeli",
  "riskli",
  "hic_teslimat_yok",
]);

function riskeCevir(value: string | null): RiskDurumu | null {
  return value != null && RISK_DEGERLERI.has(value)
    ? (value as RiskDurumu)
    : null;
}

/** RPC ISO tarih döndürür (date). Bozuk/boş değer null'a düşer. */
function yasaCevir(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const gun = Math.floor((Date.now() - t) / 86_400_000);
  return gun >= 0 ? gun : 0;
}

/** Tanımsız/bozuk değer büyük araç sınıfına düşer — küçük araca yanlışlıkla
 *  B şoförü atanmasındansa araç plan dışı kalsın. */
function ehliyeteCevir(value: string | null): EhliyetSinifi {
  return value === "B" ? "B" : "C";
}

export function duragaCevir(r: BekleyenYukRaw): RotaDuragi {
  return {
    musteriKodu: r.musteri_kodu,
    unvan: r.unvan,
    lat: r.lat,
    lon: r.lon,
    kg: sayi(r.kg),
    cuvalEsdeger: sayi(r.cuval_esdeger),
    olcusuzSatir: r.olcusuz_satir ?? 0,
    ilce: r.ilce,
    sehir: r.sehir,
    riskDurumu: riskeCevir(r.risk_durumu),
    siparisSayisi: r.siparis_sayisi ?? 0,
    brutTutar: sayi(r.brut_tutar),
    yasGun: yasaCevir(r.en_eski_siparis_tarihi),
  };
}

export function araceCevir(r: AracRaw): RotaAraci {
  return {
    kod: r.kod,
    ad: r.ad,
    cuvalKapasite: r.cuval_kapasite ?? 0,
    maxKg: sayiVeyaNull(r.max_kg),
    maxKgTeyitli: r.max_kg_teyitli === true,
    ehliyetSinifi: ehliyeteCevir(r.ehliyet_sinifi),
    takograf: r.takograf === true,
    paletKapasite: r.palet_kapasite,
    notMetni: r.not_metni,
  };
}

export function soforeCevir(r: SoforRaw): Sofor {
  return {
    kod: r.kod,
    ad: r.ad,
    ehliyetSinifi: ehliyeteCevir(r.ehliyet_sinifi),
  };
}

export interface RotaVerisi {
  duraklar: RotaDuragi[];
  araclar: RotaAraci[];
  soforler: Sofor[];
}

type SayfaSonucu<T> = Promise<{
  data: T[] | null;
  error: { message: string } | null;
}>;

/**
 * Üç kaynağı paralel çeker ve motorun beklediği biçime dönüştürür.
 *
 * Tarih penceresi SQL fonksiyonunda uygulanır — kg/çuval matematiği
 * veritabanında kalsın, uygulamada tekrarlanmasın.
 */
export async function rotaVerisiCek(
  client: SupabaseClient,
  gunPenceresi: number | null = null
): Promise<RotaVerisi> {
  const [yukRows, aracRows, soforRows] = await Promise.all([
    fetchAllRows<BekleyenYukRaw>(
      (from, to) =>
        client
          .rpc(BEKLEYEN_YUK_RPC, { p_gun: gunPenceresi })
          .order("kg", { ascending: false })
          .range(from, to) as unknown as SayfaSonucu<BekleyenYukRaw>
    ),
    fetchAllRows<AracRaw>(
      (from, to) =>
        client
          .from(ARACLAR_TABLE)
          .select(ARAC_KOLONLARI)
          .eq("aktif", true)
          .order("sira", { ascending: true })
          .range(from, to) as unknown as SayfaSonucu<AracRaw>
    ),
    fetchAllRows<SoforRaw>(
      (from, to) =>
        client
          .from(SOFORLER_TABLE)
          .select(SOFOR_KOLONLARI)
          .eq("aktif", true)
          .order("sira", { ascending: true })
          .range(from, to) as unknown as SayfaSonucu<SoforRaw>
    ),
  ]);

  return {
    duraklar: yukRows.map(duragaCevir),
    araclar: aracRows.map(araceCevir),
    soforler: soforRows.map(soforeCevir),
  };
}
