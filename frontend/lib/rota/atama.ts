/**
 * Araç atama motoru — saf fonksiyonlar, ağ çağrısı yok.
 *
 * İşin merkezindeki gerçek: doluluk TEK SAYI DEĞİL. Ortalama çuval 14,56 kg
 * olduğu için 60 çuvallık Kangoo hacmi dolmadan 874 kg'a ulaşıyor — yani
 * küçük araçta ağırlık, hafif yükte hacim önce doluyor. Her iki kısıt da ayrı
 * hesaplanır, büyük yüzde bağlayıcıdır.
 *
 * Melih'in ruhsat teyidiyle (2026-09-02) tablo şöyle:
 *
 *   Araç      Hacim   İstiap   Ağırlığı dolusu  Bağlayıcı
 *   Kangoo     60 ç.    800 kg     55 çuval     AĞIRLIK (hacmin %92'si)
 *   Transit   180 ç.  2.000 kg    137 çuval     AĞIRLIK (hacmin %76'sı)
 *   NPR 10    360 ç.  6.600 kg    453 çuval     HACİM
 *   Isuzu 3D  480 ç.  8.800 kg    604 çuval     HACİM
 *
 * İkinci kısıt ŞOFÖR: günde en fazla sınıf başına aktif şoför kadar araç
 * çıkabiliyor — bkz. `filoSec`.
 *
 * Yük değerleri `v_musteri_bekleyen_yuk` view'ından gelir; kg/çuval matematiği
 * SQL'de yapılır, burada tekrarlanmaz (risk hesabındaki kural).
 */

/** Bir müşterinin o gün taşınacak toplam yükü. */
export interface Durak {
  musteriKodu: string;
  unvan: string;
  /** Koordinatsız müşteri planlanamaz — sweep'te `koordinat-yok` ile düşer. */
  lat: number | null;
  lon: number | null;
  kg: number;
  cuvalEsdeger: number;
  /** Ölçüsü bilinmeyen satır sayısı — >0 ise yük olduğundan az görünüyor. */
  olcusuzSatir: number;
}

/**
 * Ehliyet sınıfı. Araçta "sürmek için gereken", şoförde "sürebildiği en üst".
 *
 * KAPSAYICIDIR: C ehliyeti B'yi de kapsar — C şoförü Kangoo/Transit'e de
 * biner, B şoförü Isuzu'ya binemez.
 */
export type EhliyetSinifi = "B" | "C";

export interface Arac {
  kod: string;
  ad: string;
  cuvalKapasite: number;
  /** Ruhsat istiap haddi. null → ağırlık kısıtı hesaplanmaz. */
  maxKg: number | null;
  /** false ise max_kg tahmin — UI sarı rozet gösterir. */
  maxKgTeyitli: boolean;
  ehliyetSinifi: EhliyetSinifi;
  /** Takograflı araçta 4,5 sa sürüşten sonra 30 dk mola zorunlu. */
  takograf: boolean;
}

export interface Sofor {
  kod: string;
  ad: string;
  ehliyetSinifi: EhliyetSinifi;
}

export interface Doluluk {
  kg: number;
  cuvalEsdeger: number;
  /** 0–100. maxKg yoksa null. */
  kgYuzde: number | null;
  /** 0–100. */
  cuvalYuzde: number;
  /** Hangi kısıt önce doluyor. Yük boşsa null. */
  baglayiciKisit: "agirlik" | "hacim" | null;
  /** Kısıtlardan biri %100'ü geçti. */
  asim: boolean;
  /** Yükte ölçüsü bilinmeyen satır var — gerçek yük daha ağır olabilir. */
  olcusuzVar: boolean;
}

export interface AracYuku {
  arac: Arac;
  duraklar: Durak[];
  doluluk: Doluluk;
}

export type YerlesmemeNedeni =
  /** lat/lon yok — haritaya konamaz. */
  | "koordinat-yok"
  /** Tek başına en büyük araca bile sığmıyor; sipariş bölünmeli. */
  | "kapasite-yetersiz"
  /** Filo doldu, boşta araç kalmadı. */
  | "arac-yok"
  /** Filoda boşta araç VAR ama o sınıfta şoför kalmadı. */
  | "sofor-yok";

export interface YerlesmeyenDurak {
  durak: Durak;
  neden: YerlesmemeNedeni;
}

export interface AtamaSonucu {
  yukler: AracYuku[];
  yerlesmeyen: YerlesmeyenDurak[];
}

const BOS_DOLULUK: Doluluk = {
  kg: 0,
  cuvalEsdeger: 0,
  kgYuzde: null,
  cuvalYuzde: 0,
  baglayiciKisit: null,
  asim: false,
  olcusuzVar: false,
};

function yuzde(deger: number, kapasite: number): number {
  if (!(kapasite > 0)) return 0;
  return (deger / kapasite) * 100;
}

/**
 * Bir aracın verilen duraklarla doluluğu. Ağırlık ve hacim BAĞIMSIZ hesaplanır;
 * `baglayiciKisit` hangisinin önce dolduğunu söyler.
 */
export function dolulukHesapla(arac: Arac, duraklar: Durak[]): Doluluk {
  if (duraklar.length === 0) return { ...BOS_DOLULUK };

  let kg = 0;
  let cuvalEsdeger = 0;
  let olcusuzVar = false;
  for (const d of duraklar) {
    kg += d.kg;
    cuvalEsdeger += d.cuvalEsdeger;
    if (d.olcusuzSatir > 0) olcusuzVar = true;
  }

  const cuvalYuzde = yuzde(cuvalEsdeger, arac.cuvalKapasite);
  const kgYuzde = arac.maxKg != null ? yuzde(kg, arac.maxKg) : null;

  return {
    kg,
    cuvalEsdeger,
    kgYuzde,
    cuvalYuzde,
    // Ağırlık limiti tanımsızsa tek ölçülebilir kısıt hacim
    baglayiciKisit:
      kgYuzde != null && kgYuzde > cuvalYuzde ? "agirlik" : "hacim",
    asim: cuvalYuzde > 100 || (kgYuzde != null && kgYuzde > 100),
    olcusuzVar,
  };
}

/** Aday durak mevcut yükün üstüne sığar mı — iki kısıt da aşılmamalı. */
export function sigarMi(arac: Arac, mevcut: Durak[], aday: Durak): boolean {
  let kg = aday.kg;
  let ce = aday.cuvalEsdeger;
  for (const d of mevcut) {
    kg += d.kg;
    ce += d.cuvalEsdeger;
  }
  if (ce > arac.cuvalKapasite) return false;
  if (arac.maxKg != null && kg > arac.maxKg) return false;
  return true;
}

/**
 * Durak neden yerleşemedi. `tumFilo` plana giren araçların üst kümesi —
 * bir araç boşta ama şoförü yok diye plana girmediyse, kullanıcıya
 * "araç yok" demek yanlış olur.
 */
function yerlesmemeNedeni(
  durak: Durak,
  kullanilan: Arac[],
  tumFilo: Arac[]
): YerlesmemeNedeni {
  if (!tumFilo.some((a) => sigarMi(a, [], durak))) return "kapasite-yetersiz";

  const kullanilanKodlar = new Set(kullanilan.map((a) => a.kod));
  const planDisi = tumFilo.filter((a) => !kullanilanKodlar.has(a.kod));
  if (planDisi.some((a) => sigarMi(a, [], durak))) return "sofor-yok";

  return "arac-yok";
}

// ---------------------------------------------------------------------------
// Filo seçimi — günlük araç sayısını ŞOFÖR belirler
// ---------------------------------------------------------------------------

/** Kombinasyon patlamasına karşı sınır; bu filo için fazlasıyla yeterli. */
const MAKUL_FILO = 12;

/** Bu şoför bu aracı sürebilir mi? C ehliyeti B'yi kapsar. */
export function surebilirMi(sofor: Sofor, arac: Arac): boolean {
  return sofor.ehliyetSinifi === "C" || arac.ehliyetSinifi === "B";
}

/**
 * Verilen araç kümesine geçerli bir şoför ataması yapılabilir mi?
 *
 * Yetkiler iç içe geçtiği için (C ⊇ B) Hall koşulu iki basit kontrole iniyor:
 * Isuzu'ları yalnız C şoförü sürebilir, ve toplam araç toplam şoförü aşamaz.
 */
function filoSurulebilirMi(filo: Arac[], soforler: Sofor[]): boolean {
  if (filo.length > soforler.length) return false;
  const cArac = filo.filter((a) => a.ehliyetSinifi === "C").length;
  const cSofor = soforler.filter((s) => s.ehliyetSinifi === "C").length;
  return cArac <= cSofor;
}

/**
 * ELLE seçilen filoyu şoför kısıtına kırpar — küçültmeye ÇALIŞMAZ.
 *
 * `filoSec` "yükü karşılayan en küçük filo"yu arar; kullanıcı araçları elle
 * seçtiğinde bu yanlış olur: 4 araç seçip tek araç çıkması seçimi sessizce
 * yok saymak demek. Burada verilen sıra korunur, yalnız şoföre sığmayanlar
 * baştan sona taranarak elenir.
 *
 * Dönen `elenen`, UI'ın "şu araç çıkamıyor" diyebilmesi için.
 */
export function surulebilirKirp<T extends Arac>(
  secilen: T[],
  soforler: Sofor[]
): { cikan: T[]; elenen: T[] } {
  const cikan: T[] = [];
  const elenen: T[] = [];
  for (const arac of secilen) {
    if (filoSurulebilirMi([...cikan, arac], soforler)) cikan.push(arac);
    else elenen.push(arac);
  }
  return { cikan, elenen };
}

/** Şoförlerle sürülebilen tüm araç alt kümeleri (boş küme dahil). */
function altKumeler<T extends Arac>(araclar: T[], soforler: Sofor[]): T[][] {
  if (soforler.length === 0 || araclar.length === 0) return [[]];

  // Filo büyürse 2^n alt küme anlamsız pahalıya gelir; en büyük kapasiteli
  // araçlardan sürülebilir tek bir aday üret.
  if (araclar.length > MAKUL_FILO) {
    const sirali = [...araclar].sort((a, b) => b.cuvalKapasite - a.cuvalKapasite);
    const aday: T[] = [];
    for (const a of sirali) {
      if (filoSurulebilirMi([...aday, a], soforler)) aday.push(a);
    }
    return [[], aday];
  }

  const sonuc: T[][] = [];
  for (let maske = 0; maske < 1 << araclar.length; maske++) {
    const secim = araclar.filter((_, i) => (maske & (1 << i)) !== 0);
    if (filoSurulebilirMi(secim, soforler)) sonuc.push(secim);
  }
  return sonuc;
}

function kapasite(filo: Arac[]): { cuval: number; kg: number } {
  let cuval = 0;
  let kg = 0;
  for (const a of filo) {
    cuval += a.cuvalKapasite;
    kg += a.maxKg ?? Number.POSITIVE_INFINITY;
  }
  return { cuval, kg };
}

export interface FiloSecimi<T extends Arac = Arac> {
  /** O gün çıkabilecek araçlar. */
  secilen: T[];
  /** aracKod → o aracı sürecek şoför. Aynı sınıftakiler birbirinin yerine
   *  geçebildiği için sıraya göre eşleştirilir. */
  atamalar: Record<string, Sofor>;
  /** Sınıf başına aktif şoför — UI "3 şoför" satırı için. */
  soforSayisi: Record<EhliyetSinifi, number>;
  /** Seçilen filonun kaba kapasitesi toplam yükü karşılıyor mu. */
  yeterli: boolean;
  gerekce: string;
}

/**
 * Seçilen araçlara şoför dağıtır.
 *
 * Önce Isuzu'lar — onları yalnız C şoförü sürebilir. Küçük araçlara ise önce
 * B şoförü verilir ki C şoförleri boşa harcanmasın; B kalmazsa C biner.
 */
function soforAta(secilen: Arac[], soforler: Sofor[]): Record<string, Sofor> {
  const bosta = [...soforler];
  const atamalar: Record<string, Sofor> = {};

  const al = (tercih: EhliyetSinifi, arac: Arac): Sofor | undefined => {
    let i = bosta.findIndex(
      (s) => s.ehliyetSinifi === tercih && surebilirMi(s, arac)
    );
    if (i < 0) i = bosta.findIndex((s) => surebilirMi(s, arac));
    return i >= 0 ? bosta.splice(i, 1)[0] : undefined;
  };

  for (const arac of secilen.filter((a) => a.ehliyetSinifi === "C")) {
    const sofor = al("C", arac);
    if (sofor) atamalar[arac.kod] = sofor;
  }
  for (const arac of secilen.filter((a) => a.ehliyetSinifi === "B")) {
    const sofor = al("B", arac);
    if (sofor) atamalar[arac.kod] = sofor;
  }
  return atamalar;
}

/**
 * O gün hangi araçların çıkacağını seçer. Sınıf başına en fazla **aktif şoför
 * sayısı** kadar araç plana girer.
 *
 * Kadro (2026-09-02): Mehmet Baylav ve Muzaffer Günüşen tüm araçları, Ramazan
 * Türkkan yalnız Kangoo/Transit'i sürüyor. Ehliyet kapsayıcı olduğu için
 * pratikte iki kural kalıyor: **günde en fazla 3 araç** ve **en fazla 2 Isuzu**.
 * Kangoo ile Transit aynı gün çıkabilir. 4 aracı da dolduran bir plan kâğıtta
 * geçerli, sahada uygulanamaz olurdu.
 *
 * Aday uzayı küçük (4 araç → 16 alt küme), tamamı denenir. Yükü
 * karşılayanlar arasından **en az araçlı, sonra en küçük kapasiteli** seçilir:
 * Melih "araçlar dolmadan göndermeyi tercih etmiyoruz" dedi, yani üç aracı
 * yarım doldurmaktansa ikisini tam doldurmak istiyor. Hiçbiri yetmiyorsa en
 * büyük filo seçilir ve artan duraklar havuzda kalır (sipariş biriktikçe
 * planlanıyor — bekleyen durak ertesi güne kalır).
 */
export function filoSec<T extends Arac>(
  duraklar: Durak[],
  araclar: T[],
  soforler: Sofor[]
): FiloSecimi<T> {
  const soforSayisi: Record<EhliyetSinifi, number> = { B: 0, C: 0 };
  for (const s of soforler) soforSayisi[s.ehliyetSinifi]++;

  // Koordinatsız durak zaten plana giremez; kapasite talebi de yaratmasın.
  let toplamKg = 0;
  let toplamCuval = 0;
  for (const d of duraklar) {
    if (d.lat == null || d.lon == null) continue;
    toplamKg += d.kg;
    toplamCuval += d.cuvalEsdeger;
  }

  const puanli = altKumeler(araclar, soforler).map((filo) => {
    const kap = kapasite(filo);
    return {
      filo,
      kap,
      yeterli: toplamCuval <= kap.cuval && toplamKg <= kap.kg,
    };
  });

  const yeterliler = puanli.filter((p) => p.yeterli && p.filo.length > 0);
  const secim =
    yeterliler.length > 0
      ? yeterliler.sort(
          (a, b) =>
            a.filo.length - b.filo.length || a.kap.cuval - b.kap.cuval
        )[0]!
      : puanli.sort((a, b) => b.kap.cuval - a.kap.cuval)[0]!;

  const toplamSofor = soforSayisi.B + soforSayisi.C;
  const gerekce = secim.yeterli
    ? `${toplamSofor} şoför (${soforSayisi.C}'i tüm araçları sürebiliyor) — ` +
      `yükü karşılayan en küçük filo seçildi.`
    : `Bekleyen yük ${Math.round(toplamCuval)} çuval / ${Math.round(toplamKg)} kg, ` +
      `çıkabilecek filo ${secim.kap.cuval} çuval. Artan duraklar havuzda kalıyor.`;

  return {
    secilen: secim.filo,
    atamalar: soforAta(secim.filo, soforler),
    soforSayisi,
    yeterli: secim.yeterli,
    gerekce,
  };
}

/** Depodan görülen kutupsal açı, [0, 2π). Sweep sıralamasının anahtarı. */
export function depoAcisi(
  durak: { lat: number | null; lon: number | null },
  depo: { lat: number; lon: number }
): number {
  if (durak.lat == null || durak.lon == null) return Number.NaN;
  const aci = Math.atan2(durak.lat - depo.lat, durak.lon - depo.lon);
  return aci < 0 ? aci + 2 * Math.PI : aci;
}

function bosYukler(araclar: Arac[]): AracYuku[] {
  return araclar.map((arac) => ({
    arac,
    duraklar: [],
    doluluk: { ...BOS_DOLULUK },
  }));
}

function dolulugaGoreTamamla(yukler: AracYuku[]): void {
  for (const y of yukler) {
    y.doluluk = dolulukHesapla(y.arac, y.duraklar);
  }
}

/**
 * Sweep (süpürme) kümeleme — depodan kutupsal açıya göre dizip kapasite
 * dolana kadar aynı araca yükler, sonra bir sonrakine geçer.
 *
 * Panorama rut tanımının yerine geçen kısım budur: rut'un `ziyaret_sira`
 * alanı coğrafi değil (ölçüldü — TSP alt sınırının 4,5–37 katı), o yüzden
 * duraklar koordinattan yeniden kümeleniyor.
 *
 * Araçlar verilen SIRAYLA doldurulur (çağıran `sira` kolonuna göre gönderir).
 * Bir araç dolduğunda geri dönülmez: sonraki hafif durak önceki araca
 * sığacak olsa bile sonrakine gider. Bu bilinçli — aracın güzergâhı haritada
 * ileri geri zıplamasın diye sweep'in tanımı bu.
 */
export function sweepKumele(
  duraklar: Durak[],
  araclar: Arac[],
  depo: { lat: number; lon: number },
  /** Filonun tamamı — verilirse "şoför yok" ile "araç yok" ayrışır. */
  tumFilo: Arac[] = araclar
): AtamaSonucu {
  const yukler = bosYukler(araclar);
  const yerlesmeyen: YerlesmeyenDurak[] = [];

  const konumlu: Durak[] = [];
  for (const d of duraklar) {
    if (d.lat == null || d.lon == null) {
      yerlesmeyen.push({ durak: d, neden: "koordinat-yok" });
    } else {
      konumlu.push(d);
    }
  }

  const sirali = [...konumlu].sort(
    (a, b) => depoAcisi(a, depo) - depoAcisi(b, depo)
  );

  let i = 0;
  for (const durak of sirali) {
    // Tek başına hiçbir araca sığmayan durak filo imlecini YAKMAMALI. Aksi
    // halde tek bir dev sipariş (ör. 8,7 tonluk toptancı) imleci filonun
    // sonuna itiyor ve arkasındaki duraklar boş duran araca binemiyor —
    // 24.02.2026 gününü geri oynatırken Isuzu 3D bu yüzden boş kalmıştı.
    if (!araclar.some((a) => sigarMi(a, [], durak))) {
      yerlesmeyen.push({
        durak,
        neden: yerlesmemeNedeni(durak, araclar, tumFilo),
      });
      continue;
    }

    let yerlesti = false;
    while (i < yukler.length) {
      const hedef = yukler[i]!;
      if (sigarMi(hedef.arac, hedef.duraklar, durak)) {
        hedef.duraklar.push(durak);
        yerlesti = true;
        break;
      }
      i++;
    }
    if (!yerlesti) {
      yerlesmeyen.push({
        durak,
        neden: yerlesmemeNedeni(durak, araclar, tumFilo),
      });
    }
  }

  dolulugaGoreTamamla(yukler);
  return { yukler, yerlesmeyen };
}

/**
 * First-fit-decreasing — ağır duraktan başlayıp ilk sığan araca koyar.
 * Coğrafyayı gözetmez; elle düzenleme ve "kalan durakları dağıt" için.
 * Kapasite kullanımı sweep'ten iyi, güzergâh kalitesi kötüdür.
 */
export function ffdAta(
  duraklar: Durak[],
  araclar: Arac[],
  tumFilo: Arac[] = araclar
): AtamaSonucu {
  const yukler = bosYukler(araclar);
  const yerlesmeyen: YerlesmeyenDurak[] = [];

  const sirali = [...duraklar].sort((a, b) => b.kg - a.kg);

  for (const durak of sirali) {
    if (durak.lat == null || durak.lon == null) {
      yerlesmeyen.push({ durak, neden: "koordinat-yok" });
      continue;
    }
    const hedef = yukler.find((y) => sigarMi(y.arac, y.duraklar, durak));
    if (hedef) {
      hedef.duraklar.push(durak);
    } else {
      yerlesmeyen.push({
        durak,
        neden: yerlesmemeNedeni(durak, araclar, tumFilo),
      });
    }
  }

  dolulugaGoreTamamla(yukler);
  return { yukler, yerlesmeyen };
}

/**
 * Bir araca daha kaç çuval / kaç kg sığar. UI'da "bu araca 40 çuval daha
 * eklenebilir" ipucu için.
 */
export function kalanKapasite(
  arac: Arac,
  duraklar: Durak[]
): { cuval: number; kg: number | null } {
  const d = dolulukHesapla(arac, duraklar);
  return {
    cuval: Math.max(0, arac.cuvalKapasite - d.cuvalEsdeger),
    kg: arac.maxKg != null ? Math.max(0, arac.maxKg - d.kg) : null,
  };
}
