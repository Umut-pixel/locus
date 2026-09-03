/**
 * Otomatik plan kurma — veri çek, dağıt, sırala, kaydedilebilir gövde üret.
 *
 * Bu akış daha önce yalnız `RotaPlaniProvider` içinde yaşıyordu (React
 * state'ine bağlı üç callback). Sohbet asistanının "rota oluştur" diyebilmesi
 * için aynı işin sunucuda da çalışması gerekti; mantık buraya taşındı ki tek
 * bir doğru plan tanımı olsun — ekran ve asistan aynı sonucu üretsin.
 *
 * Kaydetme burada YOK. Taslak üretilir, kullanıcı onaylar, ondan sonra
 * /api/rota/plan çağrılır: kaydetme sil-sonra-yaz olduğu için o günün mevcut
 * planını sessizce ezmemeli.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEPOT } from "@/lib/depot";
import {
  dolulukHesapla,
  filoSec,
  surulebilirKirp,
  type Sofor,
} from "@/lib/rota/atama";
import { MAX_ARA_DURAK, siraOptimizeEt } from "@/lib/rota/google-routes";
import { sonrakiKalkis } from "@/lib/rota/operasyon";
import { planOlustur } from "@/lib/rota/planla";
import { VARSAYILAN_TERCIHLER, type Strateji } from "@/lib/rota/tercihler";
import { rotaVerisiCek, type RotaAraci, type RotaDuragi } from "@/lib/rota/veri";

export interface TaslakDurak {
  musteriKodu: string;
  unvan: string;
  kg: number;
  cuvalEsdeger: number;
  lat: number | null;
  lon: number | null;
  ilce: string | null;
}

export interface TaslakPlan {
  aracKod: string;
  aracAd: string;
  soforKod: string | null;
  soforAd: string | null;
  duraklar: TaslakDurak[];
  kgDoluluk: number | null;
  cuvalDoluluk: number | null;
  googleSureSn: number | null;
  googleMesafeM: number | null;
}

export interface RotaTaslagi {
  planTarihi: string;
  planlar: TaslakPlan[];
  /** Plana giren durak sayısı. */
  atananDurak: number;
  /** Kapasite/şoför yetmediği için havuzda kalan durak sayısı. */
  havuzdaKalan: number;
  /** Koordinatı olmadığı için plana hiç giremeyen durak sayısı. */
  koordinatsiz: number;
  toplamKg: number;
  toplamCuval: number;
  /** aracKod → optimizasyon neden yapılamadı. Boşsa hepsi sıralandı. */
  optimizeHatalari: Record<string, string>;
}

export interface OtomatikPlanParams {
  /** Havuza kaç günlük sipariş girsin. null = hepsi. */
  gunPenceresi?: number | null;
  strateji?: Strateji;
  uzakAyir?: boolean;
  /** null = filoyu sistem seçsin. Dizi = elle seçilmiş araç kodları. */
  aracKodlari?: string[] | null;
  /** YYYY-MM-DD. Verilmezse bugünün İstanbul tarihi. */
  planTarihi?: string;
  /** Yoksa Google sıralaması atlanır; dağıtımın ürettiği sıra korunur. */
  googleApiKey?: string;
}

function bugunIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function taslakDurak(d: RotaDuragi): TaslakDurak {
  return {
    musteriKodu: d.musteriKodu,
    unvan: d.unvan,
    kg: d.kg,
    cuvalEsdeger: d.cuvalEsdeger,
    lat: d.lat,
    lon: d.lon,
    ilce: d.ilce,
  };
}

interface SiraSonucu {
  sirali: RotaDuragi[];
  saniye: number | null;
  metre: number | null;
  hata?: string;
}

/**
 * Araç duraklarını trafiğe göre sıraya dizer.
 *
 * Hata yutulur: Google'a ulaşılamazsa plan yine de kurulmalı — dağıtımın
 * ürettiği sıra korunur ve sebep `optimizeHatalari`'na yazılır. Sıralama bir
 * iyileştirme, ön koşul değil.
 */
async function sirala(
  duraklar: RotaDuragi[],
  apiKey: string,
  kalkis: string
): Promise<SiraSonucu> {
  const koordinatli = duraklar.filter((d) => d.lat != null && d.lon != null);
  if (koordinatli.length < 2) {
    return { sirali: duraklar, saniye: null, metre: null };
  }
  if (koordinatli.length > MAX_ARA_DURAK) {
    return {
      sirali: duraklar,
      saniye: null,
      metre: null,
      hata:
        `${koordinatli.length} durak Google'ın ${MAX_ARA_DURAK} durak ` +
        "sınırını aşıyor; dağıtım sırası korundu.",
    };
  }

  try {
    const sonuc = await siraOptimizeEt({
      depo: { lat: DEPOT.lat, lon: DEPOT.lon },
      duraklar: koordinatli.map((d) => ({
        lat: d.lat as number,
        lon: d.lon as number,
      })),
      // Araç günün sonunda depoya dönüyor (Melih) — güzergâh kapalı halka,
      // dönüş bacağı da süreye giriyor.
      depoyaDonus: true,
      kalkis,
      apiKey,
    });

    const sirali = sonuc.sira
      .map((i) => koordinatli[i])
      .filter((d): d is RotaDuragi => d != null);
    // Koordinatsız durak sıraya giremez ama yük olarak araçta kalır.
    const koordinatsizlar = duraklar.filter((d) => d.lat == null || d.lon == null);

    return {
      sirali: [...sirali, ...koordinatsizlar],
      saniye: sonuc.toplamSaniye,
      metre: sonuc.toplamMetre,
    };
  } catch (err) {
    return {
      sirali: duraklar,
      saniye: null,
      metre: null,
      hata: err instanceof Error ? err.message : "Optimizasyon başarısız.",
    };
  }
}

/**
 * O gün çıkacak araçlar ve şoförleri.
 *
 * Elle seçim varsa OLDUĞU GİBİ geçerli — yalnız şoföre sığmayanlar elenir.
 * Burada doğrudan `filoSec` çağırmak hata olurdu: o "yükü karşılayan en küçük
 * filo"yu arar, yani 4 araç seçildiğinde yük tek Transit'e sığıyorsa diğer
 * üçünü atardı.
 */
function cikacakAraclar(
  duraklar: RotaDuragi[],
  araclar: RotaAraci[],
  soforler: Sofor[],
  aracKodlari: string[] | null | undefined
): { cikan: RotaAraci[]; atamalar: Record<string, Sofor> } {
  if (aracKodlari == null) {
    const filo = filoSec(duraklar, araclar, soforler);
    return { cikan: filo.secilen, atamalar: filo.atamalar };
  }
  const istenen = new Set(aracKodlari);
  // Sıra `araclar`dan gelir (sira kolonu) — istek sırası değil, sabit.
  const elle = araclar.filter((a) => istenen.has(a.kod));
  const { cikan } = surulebilirKirp(elle, soforler);
  const filo = filoSec(duraklar, cikan, soforler);
  return { cikan, atamalar: filo.atamalar };
}

/**
 * Bekleyen yükten kaydedilmeye hazır bir plan taslağı üretir.
 * Veritabanına hiçbir şey yazmaz.
 */
export async function otomatikPlanKur(
  client: SupabaseClient,
  params: OtomatikPlanParams = {}
): Promise<RotaTaslagi> {
  const {
    gunPenceresi = VARSAYILAN_TERCIHLER.gunPenceresi,
    strateji = VARSAYILAN_TERCIHLER.strateji,
    uzakAyir = VARSAYILAN_TERCIHLER.uzakAyir,
    aracKodlari = null,
    planTarihi = bugunIstanbul(),
    googleApiKey,
  } = params;

  const { duraklar, araclar, soforler } = await rotaVerisiCek(client, gunPenceresi);
  const { cikan, atamalar } = cikacakAraclar(duraklar, araclar, soforler, aracKodlari);

  const sonuc = planOlustur({
    duraklar,
    araclar: cikan,
    tumFilo: araclar,
    depo: DEPOT,
    strateji,
    uzakAyir,
  });

  // Trafik tahmini kalkış saatine göre yapılır. "Şimdi" göndermek akşam
  // yapılan planlamada yanlış süre üretiyordu.
  const kalkis = sonrakiKalkis().toISOString();
  const optimizeHatalari: Record<string, string> = {};
  const planlar: TaslakPlan[] = [];
  let atananDurak = 0;

  for (const yuk of sonuc.yukler) {
    if (yuk.duraklar.length === 0) continue;
    const liste = yuk.duraklar as RotaDuragi[];

    let sirali = liste;
    let saniye: number | null = null;
    let metre: number | null = null;

    if (googleApiKey) {
      const s = await sirala(liste, googleApiKey, kalkis);
      sirali = s.sirali;
      saniye = s.saniye;
      metre = s.metre;
      if (s.hata) optimizeHatalari[yuk.arac.kod] = s.hata;
    }

    const doluluk = dolulukHesapla(yuk.arac, sirali);
    const sofor = atamalar[yuk.arac.kod];
    atananDurak += sirali.length;

    planlar.push({
      aracKod: yuk.arac.kod,
      aracAd: yuk.arac.ad,
      // ERP'de araç verisi yok — "kim neyi sürdü" geçmişinin tek kaynağı bu
      // kayıt. Ad dondurularak yazılıyor ki kadro değişse de kalsın.
      soforKod: sofor?.kod ?? null,
      soforAd: sofor?.ad ?? null,
      duraklar: sirali.map(taslakDurak),
      kgDoluluk: doluluk.kgYuzde,
      cuvalDoluluk: doluluk.cuvalYuzde,
      googleSureSn: saniye,
      googleMesafeM: metre,
    });
  }

  let toplamKg = 0;
  let toplamCuval = 0;
  let koordinatsiz = 0;
  for (const d of duraklar) {
    toplamKg += d.kg;
    toplamCuval += d.cuvalEsdeger;
    if (d.lat == null || d.lon == null) koordinatsiz++;
  }

  return {
    planTarihi,
    planlar,
    atananDurak,
    havuzdaKalan: duraklar.length - atananDurak,
    koordinatsiz,
    toplamKg,
    toplamCuval,
    optimizeHatalari,
  };
}

/** Taslağı /api/rota/plan gövdesine çevirir (onaydan sonraki kaydetme adımı). */
export function kaydetGovdesi(taslak: RotaTaslagi) {
  return {
    planTarihi: taslak.planTarihi,
    planlar: taslak.planlar.map((p) => ({
      aracKod: p.aracKod,
      soforKod: p.soforKod,
      soforAd: p.soforAd,
      duraklar: p.duraklar.map((d) => ({
        musteriKodu: d.musteriKodu,
        kg: d.kg,
        cuvalEsdeger: d.cuvalEsdeger,
      })),
      kgDoluluk: p.kgDoluluk,
      cuvalDoluluk: p.cuvalDoluluk,
      googleSureSn: p.googleSureSn,
      googleMesafeM: p.googleMesafeM,
    })),
  };
}
