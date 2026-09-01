/**
 * Araç atama motoru — saf fonksiyonlar, ağ çağrısı yok.
 *
 * İşin merkezindeki gerçek: doluluk TEK SAYI DEĞİL. Ortalama çuval 14,56 kg
 * olduğu için 60 çuvallık Kangoo hacmi dolmadan 874 kg'a ulaşıyor — yani
 * küçük araçta ağırlık, hafif yükte hacim önce doluyor. Her iki kısıt da ayrı
 * hesaplanır, büyük yüzde bağlayıcıdır.
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

export interface Arac {
  kod: string;
  ad: string;
  cuvalKapasite: number;
  /** Ruhsat istiap haddi. null → ağırlık kısıtı hesaplanmaz. */
  maxKg: number | null;
  /** false ise max_kg tahmin — UI sarı rozet gösterir. */
  maxKgTeyitli: boolean;
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
  | "arac-yok";

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

/** Durak tek başına hangi araca olsa sığıyor mu? Hayırsa sipariş bölünmeli. */
function hicbirAracaSigmaz(durak: Durak, araclar: Arac[]): boolean {
  return !araclar.some((a) => sigarMi(a, [], durak));
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
  depo: { lat: number; lon: number }
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
        neden: hicbirAracaSigmaz(durak, araclar)
          ? "kapasite-yetersiz"
          : "arac-yok",
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
export function ffdAta(duraklar: Durak[], araclar: Arac[]): AtamaSonucu {
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
        neden: hicbirAracaSigmaz(durak, araclar)
          ? "kapasite-yetersiz"
          : "arac-yok",
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
