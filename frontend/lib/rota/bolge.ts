/**
 * Bölge ve tur kümeleme — saf fonksiyonlar, ağ çağrısı yok.
 *
 * NEDEN VAR
 *   `sweepKumele` durakları depo açısına göre dizip ARAÇ SIRASINA göre
 *   kapasite dolana kadar dolduruyor: kesim noktası tamamen kapasiteye bağlı,
 *   coğrafi kimlik motora hiç girmiyor. Gerçek sevkiyat günlerinde ölçüldü:
 *
 *     2025-12-22  Transit   Aydın (4 km) + İstanbul (325 km)   → 2 durak
 *     2026-01-21  Isuzu 3D  İzmir + Muğla                      → 24-224 km
 *     2026-08-18  NPR 10    Balıkesir + Çanakkale + İzmir      → 10-241 km
 *
 *   Aynı günlerde 25 bölgenin 4'ü iki araca bölünüyordu. Yükün araca değil
 *   BÖLGEYE göre dağıtılması gerekiyor; araç bölgeden sonra seçiliyor.
 *
 * KAVRAMLAR
 *   Bölge (`Bolge`) — coğrafi küme. Atom birimi İLÇE: bir ilçenin durakları
 *     asla iki bölgeye bölünmez.
 *   Tur (`Tur`)     — bir aracın o gün gideceği bölge kümesi. "Rut" derken
 *     kastedilen bu; Panorama'nın `rut_kod` alanı DEĞİL (o satış temsilcisi
 *     portföyü: gün tutarlılığı %18, ziyaret sırası TSP alt sınırının 4,5-37
 *     katı — 2026-09-01'de ölçüldü, Melih de "dikkate almayalım" dedi).
 *
 * Bağımlılık yönü tek yönlü: bolge.ts → atama.ts. Tersi olsaydı döngü olurdu,
 * o yüzden `bolgeAta` da burada duruyor.
 */

import { kmArasi, UZAK_ESIGI_KM } from "../depot";
import {
  depoAcisi,
  dolulukHesapla,
  sigarMi,
  type Arac,
  type AtamaSonucu,
  type AracYuku,
  type Durak,
  type YerlesmeyenDurak,
} from "./atama";

/** Depoya uzaklık kuşağı. Eşikler ölçülen şehir mesafelerinden türedi. */
export type MesafeBandi = "sehir_ici" | "yakin" | "orta" | "uzak";

/**
 * Bant eşikleri (km). Müşteri kütlesinin gerçek dağılımı (2026-09-07):
 * İzmir ort. 27 · Manisa 76 · Aydın 83 · Muğla 179 · Denizli 183 ·
 * Balıkesir 191 · Çanakkale 214 · Antalya 354.
 *
 * `yakin` üst sınırı 120 km, `planla.ts`'teki UZAK_ESIGI_KM ile aynı sayı —
 * "uzak" tanımı tek yerde kalsın diye oradan alınıyor.
 */
export const BANT_ESIKLERI: ReadonlyArray<{ bant: MesafeBandi; enFazlaKm: number }> = [
  { bant: "sehir_ici", enFazlaKm: 40 },
  { bant: "yakin", enFazlaKm: UZAK_ESIGI_KM },
  { bant: "orta", enFazlaKm: 220 },
  { bant: "uzak", enFazlaKm: Number.POSITIVE_INFINITY },
];

/**
 * Bant başına açı sektörü sayısı.
 *
 * Şehir içi 6 (60°): İzmir'de 607 müşteri var, kaba kırılım tek dev bölge
 * üretir. Uzak bantlar 4 (90°): oralar seyrek, fazla sektör tek duraklık
 * bölge patlaması yapar.
 */
const BANT_SEKTOR: Record<MesafeBandi, number> = {
  sehir_ici: 6,
  yakin: 4,
  orta: 4,
  uzak: 4,
};

/** İlçesiz müşteriyi kümelemek için koordinat hücresi (derece). */
const HUCRE = 0.1;

/** Bir turun kapsayabileceği en geniş açı — bundan genişi criss-cross olur. */
const TUR_MAX_ACI = Math.PI * (2 / 3); // 120°

/** Uzak bölgeler bu açıdan uzaksa ayrı tur — Balıkesir ile Aydın birleşmesin. */
const UZAK_TUR_ACI = Math.PI / 4; // 45°

/**
 * Küçük bölge ancak bu açı içindeki komşusuna katılabilir.
 *
 * Sınırsız bırakmak birleştirmeyi anlamsız kılıyordu: aynı bantta tek aday
 * varsa 103° ötedeki bölgeye katılıyordu (Balıkesir + Muğla aynı bölge
 * oluyordu — testte yakalandı). Komşu yoksa bölge tek başına kalır; küçük ama
 * gerçek bir uzak tur olabilir.
 */
const MAX_BIRLESTIRME_ACI = Math.PI / 3; // 60°

/**
 * Turu olan bir durak, boşta araç kalmadığında ancak bu kadar yakın bir
 * güzergâhın üstüne binebilir (km, kuş uçuşu).
 *
 * Açı yerine MESAFE ölçüsü: açı, depoya yakın iki durağı "komşu" sayarken
 * 300 km ötedeki bir durağı da aynı dilime koyabiliyor. 75 km "yolun üstünde"
 * demek — İzmir ile Aydın (78 km) sınırda, İzmir ile Balıkesir (165 km) değil.
 */
const KOMSU_MAX_KM = 75;

export interface Bolge {
  kod: string;
  /** Ekranda görünen ad: "İzmir — Kuzeydoğu", "Balıkesir +1 — Kuzey". */
  ad: string;
  bant: MesafeBandi;
  /** Açıya göre sıralı. */
  duraklar: Durak[];
  kg: number;
  cuvalEsdeger: number;
  merkez: { lat: number; lon: number };
  depoyaKm: number;
  /** Merkezin depodan görülen kutupsal açısı, [0, 2π). */
  aci: number;
  /** Bölgeyi oluşturan ilçeler — "hangi ilçeler bir arada" sorusu için. */
  ilceler: string[];
}

export interface Tur {
  kod: string;
  ad: string;
  bolgeler: Bolge[];
  /** Bölgelerin duraklarının açı sıralı birleşimi. */
  duraklar: Durak[];
  kg: number;
  cuvalEsdeger: number;
  /** Turdaki en uzak durağın depoya mesafesi — araç seçiminde sıralama anahtarı. */
  enUzakKm: number;
  bant: MesafeBandi;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Türkçe İ/I tuzağına düşmeden normalize et. */
function anahtar(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

/** "İZMİR" → "İzmir". Türkçe küçültme sonra ilk harf büyük. */
function baslikYap(value: string): string {
  const kucuk = value.toLocaleLowerCase("tr-TR");
  return kucuk.charAt(0).toLocaleUpperCase("tr-TR") + kucuk.slice(1);
}

/** İki açı arasındaki en kısa fark, [0, π]. */
export function aciFarki(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

const YONLER = [
  "Doğu",
  "Kuzeydoğu",
  "Kuzey",
  "Kuzeybatı",
  "Batı",
  "Güneybatı",
  "Güney",
  "Güneydoğu",
] as const;

/** Kutupsal açıyı (0 = doğu, saat yönünün tersi) yön adına çevirir. */
export function yonAdi(aci: number): string {
  const dilim = Math.round(aci / (Math.PI / 4)) % 8;
  return YONLER[dilim]!;
}

/**
 * Sektörün yön adı — bölge MERKEZİNDEN değil, SEKTÖRÜN ORTASINDAN türer.
 *
 * Merkezden türetmek çakışma üretiyordu: sektörler 60° (şehir içi), yön
 * adları 45° adımlı, iki komşu sektörün merkezi aynı ada yuvarlanabiliyordu.
 * Sahada "İzmir — Batı" iki kez listelendi. Sektör ortaları 60° (ya da 90°)
 * aralıklı olduğu için bu yolla aynı bant içinde ad çakışması İMKÂNSIZ.
 */
function sektorYonu(sektor: number, sektorSayisi: number): string {
  const orta = ((sektor + 0.5) * 2 * Math.PI) / sektorSayisi;
  return yonAdi(orta);
}

/** Ad çakışmasını çözerken kullanılan bant etiketi. */
const BANT_ETIKET: Record<MesafeBandi, string> = {
  sehir_ici: "şehir içi",
  yakin: "yakın",
  orta: "orta",
  uzak: "uzak",
};

function bandiBul(km: number): MesafeBandi {
  for (const e of BANT_ESIKLERI) {
    if (km < e.enFazlaKm) return e.bant;
  }
  return "uzak";
}

interface Konumlu extends Durak {
  lat: number;
  lon: number;
}

function konumlular(duraklar: Durak[]): {
  konumlu: Konumlu[];
  konumsuz: Durak[];
} {
  const konumlu: Konumlu[] = [];
  const konumsuz: Durak[] = [];
  for (const d of duraklar) {
    if (d.lat == null || d.lon == null) konumsuz.push(d);
    else konumlu.push(d as Konumlu);
  }
  return { konumlu, konumsuz };
}

/**
 * Durağın idari anahtarı. İlçe boşsa koordinat hücresine düşer —
 * ilçesiz müşteri bölgesiz kalmasın. İlçe TAHMİN EDİLMEZ (CLAUDE.md:
 * yanlış eşleşme riski ölçüldü, boş bırakılıyor).
 */
function ilceAnahtari(d: Konumlu): { anahtar: string; etiket: string | null } {
  const sehir = anahtar(d.sehir);
  const ilce = anahtar(d.ilce);
  if (ilce) {
    return {
      anahtar: `${sehir}/${ilce}`,
      etiket: baslikYap(String(d.ilce).trim()),
    };
  }
  const gx = Math.round(d.lat / HUCRE);
  const gy = Math.round(d.lon / HUCRE);
  return { anahtar: `${sehir}/~${gx},${gy}`, etiket: null };
}

function agirlikMerkezi(duraklar: Konumlu[]): { lat: number; lon: number } {
  let lat = 0;
  let lon = 0;
  for (const d of duraklar) {
    lat += d.lat;
    lon += d.lon;
  }
  return { lat: lat / duraklar.length, lon: lon / duraklar.length };
}

function toplamlar(duraklar: Durak[]): { kg: number; cuvalEsdeger: number } {
  let kg = 0;
  let cuvalEsdeger = 0;
  for (const d of duraklar) {
    kg += d.kg;
    cuvalEsdeger += d.cuvalEsdeger;
  }
  return { kg, cuvalEsdeger };
}

// ---------------------------------------------------------------------------
// Bölge kurma
// ---------------------------------------------------------------------------

interface IlceKumesi {
  anahtar: string;
  etiket: string | null;
  sehir: string | null;
  duraklar: Konumlu[];
  merkez: { lat: number; lon: number };
  km: number;
  aci: number;
}

export interface BolgeleSecenekleri {
  /**
   * Bu çuval yükünün altındaki bölge, aynı banttaki açıca en yakın komşusuna
   * katılır. Verilmezse birleştirme yapılmaz.
   */
  birlestirmeEsigiCuval?: number;
}

/**
 * Durakları coğrafi bölgelere ayırır.
 *
 * Sıra: ilçe kümele → ilçe merkezini banda ve açı sektörüne yerleştir →
 * aynı (bant, sektör) ilçeleri tek bölge yap → küçük bölgeleri komşusuna kat.
 *
 * Koordinatsız duraklar DÖNMEZ; onları çağıran `yerlesmeyen`'e koyar.
 */
export function bolgele(
  duraklar: Durak[],
  depo: { lat: number; lon: number },
  secenekler: BolgeleSecenekleri = {}
): Bolge[] {
  const { konumlu } = konumlular(duraklar);
  if (konumlu.length === 0) return [];

  // 1) İlçe kümeleri — atom birim.
  const ilceler = new Map<string, IlceKumesi>();
  for (const d of konumlu) {
    const { anahtar: ak, etiket } = ilceAnahtari(d);
    const mevcut = ilceler.get(ak);
    if (mevcut) {
      mevcut.duraklar.push(d);
    } else {
      ilceler.set(ak, {
        anahtar: ak,
        etiket,
        sehir: d.sehir ?? null,
        duraklar: [d],
        merkez: { lat: d.lat, lon: d.lon },
        km: 0,
        aci: 0,
      });
    }
  }
  for (const k of ilceler.values()) {
    k.merkez = agirlikMerkezi(k.duraklar);
    k.km = kmArasi(depo, k.merkez);
    k.aci = depoAcisi(k.merkez, depo);
  }

  // 2) (bant, sektör) → bölge.
  const kovalar = new Map<
    string,
    { bant: MesafeBandi; sektor: number; sektorSayisi: number; uyeler: IlceKumesi[] }
  >();
  for (const k of ilceler.values()) {
    const bant = bandiBul(k.km);
    const sektorSayisi = BANT_SEKTOR[bant];
    const sektor =
      Math.floor(k.aci / ((2 * Math.PI) / sektorSayisi)) % sektorSayisi;
    const kod = `${bant}-s${sektor}`;
    const liste = kovalar.get(kod);
    if (liste) liste.uyeler.push(k);
    else kovalar.set(kod, { bant, sektor, sektorSayisi, uyeler: [k] });
  }

  let bolgeler = [...kovalar.values()].map((kova) =>
    bolgeKur(kova.bant, kova.sektor, kova.sektorSayisi, kova.uyeler, depo)
  );

  // 3) Küçük bölgeleri komşusuna kat.
  const esik = secenekler.birlestirmeEsigiCuval ?? 0;
  if (esik > 0) bolgeler = kucukleriBirlestir(bolgeler, esik, depo);

  // 4) Aynı ad iki bantta çıkabilir ("İzmir — Batı" hem şehir içi hem yakın).
  //    Sektör içinde çakışma imkânsız ama bantlar arasında mümkün; yalnız
  //    çakışanlara bant etiketi ekleniyor, tek olan sade kalıyor.
  const adSayaci = new Map<string, number>();
  for (const b of bolgeler) adSayaci.set(b.ad, (adSayaci.get(b.ad) ?? 0) + 1);
  for (const b of bolgeler) {
    if ((adSayaci.get(b.ad) ?? 0) > 1) b.ad = `${b.ad} (${BANT_ETIKET[b.bant]})`;
  }

  return bolgeler.sort((a, b) => a.aci - b.aci);
}

function bolgeKur(
  bant: MesafeBandi,
  sektor: number,
  sektorSayisi: number,
  uyeler: IlceKumesi[],
  depo: { lat: number; lon: number }
): Bolge {
  const duraklar = uyeler
    .flatMap((u) => u.duraklar)
    .sort((a, b) => depoAcisi(a, depo) - depoAcisi(b, depo));
  const merkez = agirlikMerkezi(uyeler.flatMap((u) => u.duraklar));
  const km = kmArasi(depo, merkez);
  const { kg, cuvalEsdeger } = toplamlar(duraklar);

  // Ad: baskın şehir (en çok duraklı) + yön. Birden fazla şehir varsa "+N".
  const sehirSayaci = new Map<string, number>();
  for (const u of uyeler) {
    const ad = u.sehir?.trim();
    if (!ad) continue;
    sehirSayaci.set(ad, (sehirSayaci.get(ad) ?? 0) + u.duraklar.length);
  }
  const sirali = [...sehirSayaci.entries()].sort((a, b) => b[1] - a[1]);
  const baskin = sirali[0]?.[0];
  const yon = sektorYonu(sektor, sektorSayisi);
  const ad = baskin
    ? sirali.length > 1
      ? `${baslikYap(baskin)} +${sirali.length - 1} — ${yon}`
      : `${baslikYap(baskin)} — ${yon}`
    : `${yon} — ${Math.round(km)} km`;

  return {
    kod: `${bant}-s${sektor}`,
    ad,
    bant,
    duraklar,
    kg,
    cuvalEsdeger,
    merkez,
    depoyaKm: km,
    aci: depoAcisi(merkez, depo),
    ilceler: uyeler
      .map((u) => u.etiket)
      .filter((e): e is string => e != null)
      .sort((a, b) => a.localeCompare(b, "tr")),
  };
}

/**
 * Eşiğin altındaki bölgeyi AYNI BANTTAKİ açıca en yakın bölgeye katar.
 *
 * Bant sınırı korunuyor: 20 km'lik bir şehir içi bölgeyi 300 km'lik uzak
 * bölgeye katmak tam da kaçınılmak istenen şey. Bantta tek başınaysa
 * olduğu gibi kalır — bir aracı hak eden gerçek bir uzak tur olabilir.
 */
function kucukleriBirlestir(
  bolgeler: Bolge[],
  esikCuval: number,
  depo: { lat: number; lon: number }
): Bolge[] {
  const kalan = [...bolgeler];
  /** Komşusu olmadığı için katılamayan bölgeler — sonsuz döngüyü bunlar keser. */
  const birlesmeyenler = new Set<Bolge>();
  let degisti = true;

  while (degisti) {
    degisti = false;
    kalan.sort((a, b) => a.cuvalEsdeger - b.cuvalEsdeger);
    const kucuk = kalan.find(
      (b) => b.cuvalEsdeger < esikCuval && !birlesmeyenler.has(b)
    );
    if (!kucuk) break;

    const adaylar = kalan.filter(
      (b) =>
        b !== kucuk &&
        b.bant === kucuk.bant &&
        aciFarki(b.aci, kucuk.aci) <= MAX_BIRLESTIRME_ACI
    );
    if (adaylar.length === 0) {
      // Bu bölge birleşemiyor; başkaları birleşebilir diye taramaya devam.
      birlesmeyenler.add(kucuk);
      continue;
    }

    const hedef = adaylar.reduce((en, b) =>
      aciFarki(b.aci, kucuk.aci) < aciFarki(en.aci, kucuk.aci) ? b : en
    );

    const birlesik = bolgeBirlestir(hedef, kucuk, depo);
    kalan.splice(kalan.indexOf(hedef), 1, birlesik);
    kalan.splice(kalan.indexOf(kucuk), 1);
    degisti = true;
  }

  return kalan;
}

function bolgeBirlestir(
  a: Bolge,
  b: Bolge,
  depo: { lat: number; lon: number }
): Bolge {
  const duraklar = [...a.duraklar, ...b.duraklar].sort(
    (x, y) => depoAcisi(x, depo) - depoAcisi(y, depo)
  );
  const { konumlu } = konumlular(duraklar);
  const merkez = agirlikMerkezi(konumlu);
  const km = kmArasi(depo, merkez);
  const { kg, cuvalEsdeger } = toplamlar(duraklar);
  const ilceler = [...new Set([...a.ilceler, ...b.ilceler])].sort((x, y) =>
    x.localeCompare(y, "tr")
  );
  return {
    // Büyük olanın kimliği korunur — ekranda bölge adı sürekli değişmesin.
    kod: a.kod,
    ad: a.ad,
    bant: a.bant,
    duraklar,
    kg,
    cuvalEsdeger,
    merkez,
    depoyaKm: km,
    aci: depoAcisi(merkez, depo),
    ilceler,
  };
}

// ---------------------------------------------------------------------------
// Tur kurma — bölgeleri araç boyutunda kümelere ayır
// ---------------------------------------------------------------------------

/**
 * Bölgeleri turlara ayırır. Bir tur = bir aracın günü.
 *
 * Uzak bölgeler (`orta`/`uzak`) ÖNCE ayrılır ve yalnız açıca yakın olanlar
 * (≤45°) birleşir: Melih'in "uzak yerlere sipariş birikince hepsini bir araca
 * yükleyip gönderiyoruz" işleyişi bu, ama Balıkesir ile Aydın'ı aynı araca
 * koymadan. Yakın bölgeler açı sırasında yürünerek biriktirilir; kapasite ya
 * da 120° açı yayılımı aşılınca yeni tur başlar.
 */
export function turKur(
  bolgeler: Bolge[],
  enBuyuk: { cuval: number; kg: number | null }
): Tur[] {
  const uzaklar = bolgeler.filter((b) => b.bant === "orta" || b.bant === "uzak");
  const yakinlar = bolgeler.filter(
    (b) => b.bant === "sehir_ici" || b.bant === "yakin"
  );

  const turlar: Tur[] = [];

  // Uzak hatlar — açıca komşu olanlar tek tur.
  const uzakSirali = [...uzaklar].sort((a, b) => a.aci - b.aci);
  let kume: Bolge[] = [];
  for (const b of uzakSirali) {
    const onceki = kume[kume.length - 1];
    if (onceki && aciFarki(onceki.aci, b.aci) > UZAK_TUR_ACI) {
      turlar.push(turYap(kume, turlar.length));
      kume = [];
    }
    kume.push(b);
  }
  if (kume.length > 0) turlar.push(turYap(kume, turlar.length));

  // Yakın bölgeler — açı sırasında kapasiteye ve açı yayılımına göre kesilir.
  const yakinSirali = [...yakinlar].sort((a, b) => a.aci - b.aci);
  kume = [];
  for (const b of yakinSirali) {
    const aday = [...kume, b];
    const { cuvalEsdeger, kg } = toplamlar(aday.flatMap((x) => x.duraklar));
    const yayilim = aciYayilimi(aday);
    const tasti =
      kume.length > 0 &&
      (cuvalEsdeger > enBuyuk.cuval ||
        (enBuyuk.kg != null && kg > enBuyuk.kg) ||
        yayilim > TUR_MAX_ACI);
    if (tasti) {
      turlar.push(turYap(kume, turlar.length));
      kume = [];
    }
    kume.push(b);
  }
  if (kume.length > 0) turlar.push(turYap(kume, turlar.length));

  return turlar;
}

/** Bölge açılarının kapsadığı en dar yay. */
function aciYayilimi(bolgeler: Bolge[]): number {
  if (bolgeler.length < 2) return 0;
  const acilar = bolgeler.map((b) => b.aci).sort((a, b) => a - b);
  // En büyük boşluğu bulup onun tamamlayanını al — 350°/10° sarmasında doğru
  // sonuç veren tek yol.
  let enBuyukBosluk = acilar[0]! + 2 * Math.PI - acilar[acilar.length - 1]!;
  for (let i = 1; i < acilar.length; i++) {
    const bosluk = acilar[i]! - acilar[i - 1]!;
    if (bosluk > enBuyukBosluk) enBuyukBosluk = bosluk;
  }
  return 2 * Math.PI - enBuyukBosluk;
}

function turYap(bolgeler: Bolge[], sira: number): Tur {
  const duraklar = bolgeler.flatMap((b) => b.duraklar);
  const { kg, cuvalEsdeger } = toplamlar(duraklar);
  const enUzakKm = bolgeler.reduce((m, b) => Math.max(m, b.depoyaKm), 0);
  // Bant: turun en uzak bölgesi belirler — araç ve süre onu kaldırmalı.
  const bant = bolgeler.reduce<MesafeBandi>(
    (m, b) => (bantSirasi(b.bant) > bantSirasi(m) ? b.bant : m),
    "sehir_ici"
  );
  const ad =
    bolgeler.length === 1
      ? bolgeler[0]!.ad
      : `${bolgeler[0]!.ad} +${bolgeler.length - 1}`;
  return {
    kod: `tur-${sira + 1}`,
    ad,
    bolgeler,
    duraklar,
    kg,
    cuvalEsdeger,
    enUzakKm,
    bant,
  };
}

function bantSirasi(b: MesafeBandi): number {
  return BANT_ESIKLERI.findIndex((e) => e.bant === b);
}

// ---------------------------------------------------------------------------
// Atama — bölge önce, araç sonra
// ---------------------------------------------------------------------------

/** Araç bu durak kümesinin tamamını alabilir mi? */
function turSigarMi(arac: Arac, duraklar: Durak[]): boolean {
  return !dolulukHesapla(arac, duraklar).asim;
}

/**
 * Bölge bazlı dağıtım — `sweepKumele` / `ffdAta` ile aynı sözleşme.
 *
 * Sıra ÖNEMLİ: turlar en uzaktan başlayarak yerleşir. Uzak tur bir aracın
 * gününü tamamen yiyor; şehir içi turlar kalan araçlara sığar, tersi olmaz.
 *
 * Araç seçimi turu TAMAMEN alabilen EN KÜÇÜK araç. Melih "araçlar dolmadan
 * göndermeyi tercih etmiyoruz" dedi — en küçük sığan, en yüksek doluluk.
 * `sira` kolonuna göre doldurma BURADA YOK; sweep'teki o davranış süpürmenin
 * ilk dilimini en küçük araca veriyordu.
 */
export interface BolgeAtaSecenekleri {
  /**
   * Bölge kodu → araç kodu. Sabitlenen bölge doğrudan o araca yerleşir ve
   * dağıtım onu başka araca koymaz.
   *
   * Kullanıcının GÜNLÜK kararı; kalıcı bir eşleme değil. Kalıcı eşleme
   * (ör. "Isuzu 3D hep Kuzey hattı") değişken yükte tıkanıyor: aynı bölge
   * bir gün 200, ertesi gün 900 çuval olabiliyor ve o hatta yük olmayan
   * günlerde en büyük kamyon boş bekler.
   *
   * Artık var olmayan bölge kodu SESSİZCE yok sayılır — havuz değiştikçe
   * bölge kodları değişebiliyor, eski bir sabitleme planı patlatmamalı.
   */
  sabitlemeler?: Record<string, string>;
}

export function bolgeAta(
  duraklar: Durak[],
  araclar: Arac[],
  depo: { lat: number; lon: number },
  tumFilo: Arac[] = araclar,
  secenekler: BolgeAtaSecenekleri = {}
): AtamaSonucu {
  const yukler: AracYuku[] = araclar.map((arac) => ({
    arac,
    duraklar: [],
    doluluk: dolulukHesapla(arac, []),
  }));
  const yerlesmeyen: YerlesmeyenDurak[] = [];

  const { konumlu, konumsuz } = konumlular(duraklar);
  for (const d of konumsuz) {
    yerlesmeyen.push({ durak: d, neden: "koordinat-yok" });
  }
  if (araclar.length === 0) {
    for (const d of konumlu) {
      yerlesmeyen.push({ durak: d, neden: nedenBul(d, araclar, tumFilo) });
    }
    return { yukler, yerlesmeyen };
  }

  const enKucukCuval = Math.min(...araclar.map((a) => a.cuvalKapasite));
  const enBuyuk = {
    cuval: Math.max(...araclar.map((a) => a.cuvalKapasite)),
    kg: araclar.some((a) => a.maxKg == null)
      ? null
      : Math.max(...araclar.map((a) => a.maxKg!)),
  };

  const bolgeler = bolgele(konumlu, depo, {
    // Bir bölge en küçük aracın dörtte birini bile doldurmuyorsa tek başına
    // anlamlı bir tur değil; komşusuna katılsın.
    birlestirmeEsigiCuval: enKucukCuval * 0.25,
  });

  // Sabitlenen bölgeler önce yerleşir; araçları rezerve olur ve tur kurmaya
  // girmezler. Sığmayan kısım normal bölge gibi kuyruğa döner.
  const sabitlemeler = secenekler.sabitlemeler ?? {};
  const yukHaritasi = new Map(yukler.map((y) => [y.arac.kod, y]));
  const bostakiler = new Set(yukler);
  const serbestBolgeler: Bolge[] = [];
  const artanlar: Bolge[] = [];

  for (const bolge of bolgeler) {
    const aracKod = sabitlemeler[bolge.kod];
    const hedef = aracKod ? yukHaritasi.get(aracKod) : undefined;
    if (!hedef) {
      // Sabitleme yok ya da araç bugünkü filoda değil — normal akışa.
      serbestBolgeler.push(bolge);
      continue;
    }

    const kalan: Durak[] = [];
    for (const d of bolge.duraklar) {
      if (sigarMi(hedef.arac, hedef.duraklar, d)) hedef.duraklar.push(d);
      else kalan.push(d);
    }
    // Araç rezerve: sabitlenmiş bölgeye adandı, tur dağıtımına girmiyor.
    bostakiler.delete(hedef);
    if (kalan.length > 0) artanlar.push(bolgeKalani(bolge, kalan));
  }

  const kuyruk = turKur([...serbestBolgeler, ...artanlar], enBuyuk).sort(
    (a, b) => b.enUzakKm - a.enUzakKm
  );

  while (kuyruk.length > 0) {
    const tur = kuyruk.shift()!;
    const bos = [...bostakiler].sort(
      (a, b) => a.arac.cuvalKapasite - b.arac.cuvalKapasite
    );

    const tam = bos.find((y) => turSigarMi(y.arac, tur.duraklar));
    if (tam) {
      tam.duraklar = tur.duraklar;
      bostakiler.delete(tam);
      continue;
    }

    if (bos.length > 0) {
      // Hiçbir araca sığmıyor — en büyüğüne sığanı koy, kalanı yeni tur olarak
      // sıraya al. Kullanıcı kararı: bölge bölünsün, ikinci araç aynı bölgeye.
      const hedef = bos[bos.length - 1]!;
      const kalanDuraklar: Durak[] = [];
      for (const d of tur.duraklar) {
        if (sigarMi(hedef.arac, hedef.duraklar, d)) hedef.duraklar.push(d);
        else kalanDuraklar.push(d);
      }
      bostakiler.delete(hedef);
      if (hedef.duraklar.length === 0) {
        // Tek durak bile sığmadı: bölmek çözmez, havuza.
        for (const d of tur.duraklar) {
          yerlesmeyen.push({ durak: d, neden: nedenBul(d, araclar, tumFilo) });
        }
        continue;
      }
      if (kalanDuraklar.length > 0) {
        kuyruk.unshift(turBol(tur, kalanDuraklar));
      }
      continue;
    }

    // Boşta araç kalmadı — dolu araçlarda yer varsa ve tur AÇICA KOMŞUYSA
    // oraya bin. Komşuluk şartı olmadan Aydın+İstanbul vakası geri gelir.
    const yerlesenler = yerlestirKomsuya(tur, yukler);
    for (const d of yerlesenler.kalan) {
      yerlesmeyen.push({ durak: d, neden: nedenBul(d, araclar, tumFilo) });
    }
  }

  for (const y of yukler) {
    y.doluluk = dolulukHesapla(y.arac, y.duraklar);
  }
  return { yukler, yerlesmeyen };
}

/** Sabitlenen araca sığmayan kısım — aynı bölge kimliğiyle kuyruğa döner. */
function bolgeKalani(bolge: Bolge, kalan: Durak[]): Bolge {
  const { kg, cuvalEsdeger } = toplamlar(kalan);
  return { ...bolge, duraklar: kalan, kg, cuvalEsdeger };
}

function turBol(tur: Tur, kalan: Durak[]): Tur {
  const { kg, cuvalEsdeger } = toplamlar(kalan);
  return {
    ...tur,
    kod: `${tur.kod}-b`,
    duraklar: kalan,
    kg,
    cuvalEsdeger,
  };
}

/**
 * Boşta araç kalmadığında turun duraklarını mevcut güzergâhlara dağıtır.
 *
 * Her durak, KENDİSİNE EN YAKIN durağı taşıyan araca biner — yeri varsa ve
 * mesafe `KOMSU_MAX_KM` içindeyse. Ölçüt durak bazında; tur bazında karar
 * vermek boşta duran kapasiteyi kullanılmaz bırakıyordu (2026-01-21 gününde
 * ortalama doluluk %69'a düşüp 10 durak havuzda kalıyordu).
 */
function yerlestirKomsuya(tur: Tur, yukler: AracYuku[]): { kalan: Durak[] } {
  const kalan: Durak[] = [];

  for (const d of tur.duraklar) {
    if (d.lat == null || d.lon == null) {
      kalan.push(d);
      continue;
    }
    const nokta = { lat: d.lat, lon: d.lon };

    const hedef = yukler
      .filter((y) => y.duraklar.length > 0 && sigarMi(y.arac, y.duraklar, d))
      .map((y) => ({ y, km: enYakinKm(nokta, y.duraklar) }))
      .filter((a) => a.km <= KOMSU_MAX_KM)
      .sort((a, b) => a.km - b.km)[0];

    if (hedef) hedef.y.duraklar.push(d);
    else kalan.push(d);
  }
  return { kalan };
}

/** Noktanın araçtaki en yakın durağa uzaklığı (km). */
function enYakinKm(
  nokta: { lat: number; lon: number },
  duraklar: Durak[]
): number {
  let en = Number.POSITIVE_INFINITY;
  for (const d of duraklar) {
    if (d.lat == null || d.lon == null) continue;
    const km = kmArasi(nokta, { lat: d.lat, lon: d.lon });
    if (km < en) en = km;
  }
  return en;
}

/** `atama.ts`'teki `yerlesmemeNedeni` dışa açık değil; aynı kural burada. */
function nedenBul(
  durak: Durak,
  kullanilan: Arac[],
  tumFilo: Arac[]
): YerlesmeyenDurak["neden"] {
  if (!tumFilo.some((a) => sigarMi(a, [], durak))) return "kapasite-yetersiz";
  const kullanilanKodlar = new Set(kullanilan.map((a) => a.kod));
  if (
    tumFilo.some((a) => !kullanilanKodlar.has(a.kod) && sigarMi(a, [], durak))
  ) {
    return "sofor-yok";
  }
  return "arac-yok";
}
