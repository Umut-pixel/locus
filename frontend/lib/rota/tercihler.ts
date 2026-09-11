/**
 * Planlama tercihleri — kullanıcının seçtiği, etkisi ölçülen ayarlar.
 *
 * Hepsi saf veri; planı `planla.ts` üretir, etkisini `metrik.ts` ölçer.
 * Tarayıcıda saklanır ki her açılışta yeniden ayarlanmasın.
 */

/** Durakları araçlara dağıtma yöntemi. */
export type Strateji = "bolge" | "sweep" | "ffd";

export interface Tercihler {
  /**
   * Bekleyen yük havuzuna kaç günlük sipariş girsin. null = hepsi.
   * Panorama'nın kendi penceresi 9 ay — filtresiz bırakılırsa aylardır
   * bekleyen "zombi" sipariş her plana girmeye devam eder.
   */
  gunPenceresi: number | null;
  strateji: Strateji;
  /** Bu yüzdenin altında doluluk "yarı boş çıkıyor" uyarısı verir. */
  dolulukEsigi: number;
  /**
   * Uzak duraklar şehir içi turla aynı araca binmesin.
   *
   * VARSAYILAN AÇIK (2026-09-11'den önce kapalıydı). Kapalıyken ("Karışık")
   * `sweepKumele` yalnız açıya bakıp kapasite dolana kadar dolduruyor —
   * coğrafi kimlik motora hiç girmiyor. Gerçek sevkiyat günlerinde ölçüldü
   * (bkz. `bolge.ts` başlığı): Transit Aydın (4 km) + İstanbul (325 km);
   * NPR 10 Balıkesir + Çanakkale + İzmir (10-241 km). "Bölge" stratejisinde
   * bu ayar zaten anlamsız (yapı gereği uzak/yakın hiç karışmıyor).
   */
  uzakAyir: boolean;
}

/*
 * `aracKodlari` (elle filo seçimi) BİLEREK KALDIRILDI.
 *
 * Ekranda araç seçmek iki işi karıştırıyordu: "otomatik dağıtım hangi
 * araçları kullansın" ile "hangi araca elle yük koyabilirim". Seçilmeyen araç
 * soluklaşıp tıklanamaz oluyordu ve kullanılabilir bir araç (Isuzu 3D)
 * "devre dışı" gibi görünüyordu.
 *
 * Yeni ayrım: filoyu otomatik dağıtım kendi seçer (arka planda), ama filodaki
 * HER araca elle yük konabilir. `/api/rota/otomatik` hâlâ `aracKodlari`
 * kabul ediyor — asistan belirli araçlarla plan kurmak isterse diye.
 */

/**
 * Sunucu render'ının ve hydration'ın ilk karesinde kullanılan değer.
 * Referansı SABİT olmalı — `useSyncExternalStore` her çağrıda yeni nesne
 * görürse sonsuz render döngüsüne girer.
 */
export const VARSAYILAN_TERCIHLER: Tercihler = Object.freeze({
  gunPenceresi: null,
  strateji: "bolge",
  dolulukEsigi: 70,
  // Eskiden false'tu — "Coğrafi"/"Doluluk" stratejisinde tek bir aracın
  // şehir içi turla birlikte 300+ km uzaktaki bir durağı da almasına izin
  // veriyordu (bkz. Tercihler.uzakAyir yorumu). "Bölge" varsayılan strateji
  // olduğu için bu ayarın çoğu kullanıcıya etkisi yok; yine de doğru varsayılan
  // "Bölge" dışındaki stratejileri deneyenler için de güvenli olmalı.
  uzakAyir: true,
}) as Tercihler;

/** Ekrandaki pencere seçenekleri. */
export const GUN_PENCERELERI: ReadonlyArray<{ deger: number | null; etiket: string }> = [
  { deger: 7, etiket: "7 gün" },
  { deger: 30, etiket: "30 gün" },
  { deger: 60, etiket: "60 gün" },
  { deger: 90, etiket: "90 gün" },
  { deger: null, etiket: "Hepsi" },
];

export const STRATEJILER: ReadonlyArray<{
  deger: Strateji;
  etiket: string;
  aciklama: string;
}> = [
  {
    deger: "bolge",
    etiket: "Bölge",
    aciklama:
      "Önce coğrafi bölge kurar, sonra bölgeye araç seçer — bir ilçe tek araçta kalır, uzak hat kendi aracına biner.",
  },
  {
    deger: "sweep",
    etiket: "Coğrafi",
    aciklama:
      "Depodan açıya göre süpürür — güzergâh kısa, araç dolulukları eşitsiz olabilir.",
  },
  {
    deger: "ffd",
    etiket: "Doluluk",
    aciklama:
      "Ağır duraktan başlayıp ilk sığana koyar — araçlar dolu çıkar, güzergâh uzayabilir.",
  },
];

/**
 * v1 → v2 (2026-09-11): `uzakAyir` varsayılanı `false`den `true`ya döndü.
 * Anahtar bilerek değişti — v1'de zaten `false` yazılmış (o zamanki
 * varsayılan) kayıtlar `typeof === "boolean"` kontrolünden geçerli bir seçim
 * gibi görünüp eski (güvensiz) davranışta kalırdı. Sürüm atlaması herkesi
 * yeni, güvenli varsayılana sıfırlıyor; diğer tercihler (strateji, doluluk
 * eşiği) de bir kerelik sıfırlanıyor, kayda değer bir kayıp değil.
 */
const ANAHTAR = "rota-tercihleri-v2";

function sayiVeyaNull(v: unknown): number | null {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Bozuk/eksik alanlar varsayılana düşer — eski sürümden kalan kayıt patlatmasın. */
export function tercihleriTemizle(ham: unknown): Tercihler {
  const o = (ham ?? {}) as Partial<Record<keyof Tercihler, unknown>>;
  const esik = Number(o.dolulukEsigi);

  return {
    gunPenceresi: sayiVeyaNull(o.gunPenceresi),
    // Eski kayıttaki seçim aynen korunur; yalnız tanımsız/bozuk değer
    // varsayılana (bölge) düşer — kullanıcının seçimi sessizce değişmesin.
    strateji:
      o.strateji === "ffd" || o.strateji === "sweep" || o.strateji === "bolge"
        ? o.strateji
        : VARSAYILAN_TERCIHLER.strateji,
    dolulukEsigi:
      Number.isFinite(esik) && esik >= 0 && esik <= 100
        ? esik
        : VARSAYILAN_TERCIHLER.dolulukEsigi,
    // Diğer alanlarla AYNI DESEN: geçersiz/eksik değer varsayılana düşer.
    // Eskiden `o.uzakAyir === true` idi — kayıtta alan hiç yoksa (eski
    // sürümden kalma boş obje) sessizce `false`'a düşüyordu ve varsayılanı
    // `true` yapmak bu yüzden tek başına yetmiyordu; kayıtlı tercihi olan
    // kullanıcı hep eski (güvensiz) davranışta kalıyordu.
    uzakAyir:
      typeof o.uzakAyir === "boolean"
        ? o.uzakAyir
        : VARSAYILAN_TERCIHLER.uzakAyir,
  };
}

function tercihleriOku(): Tercihler {
  if (typeof window === "undefined") return VARSAYILAN_TERCIHLER;
  try {
    const ham = window.localStorage.getItem(ANAHTAR);
    return ham ? tercihleriTemizle(JSON.parse(ham)) : VARSAYILAN_TERCIHLER;
  } catch {
    // Özel sekme veya bozuk kayıt — varsayılanla devam
    return VARSAYILAN_TERCIHLER;
  }
}

function tercihleriYaz(t: Tercihler): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANAHTAR, JSON.stringify(t));
  } catch {
    // Yazamadıysak da uygulama çalışmaya devam etmeli
  }
}

// ---------------------------------------------------------------------------
// useSyncExternalStore deposu
// ---------------------------------------------------------------------------
//
// Tercihler localStorage'da, yani sunucuda YOK. `useState(tercihleriOku)` ile
// başlatmak hydration'ı bozuyordu: sunucu varsayılanı, istemci kaydedilmiş
// değeri çiziyordu. (Client component'ler de sunucuda prerender ediliyor.)
//
// `useSyncExternalStore` bunun için var — ilk kareyi sunucu anlık görüntüsüyle
// çizip hemen ardından gerçek değere geçiyor, React uyuşmazlık uyarmıyor.

let onbellek: Tercihler | null = null;
const dinleyiciler = new Set<() => void>();

/** React abonesi. */
export function tercihAbone(fn: () => void): () => void {
  dinleyiciler.add(fn);
  return () => {
    dinleyiciler.delete(fn);
  };
}

/** İstemci anlık görüntüsü — referans DEĞİŞMEZ, yoksa React döngüye girer. */
export function tercihAnlik(): Tercihler {
  if (onbellek == null) onbellek = tercihleriOku();
  return onbellek;
}

/** Sunucu ve hydration'ın ilk karesi. */
export function tercihSunucuAnlik(): Tercihler {
  return VARSAYILAN_TERCIHLER;
}

/** Tercihleri günceller, saklar ve aboneleri uyandırır. */
export function tercihGuncelle(yeni: Partial<Tercihler>): void {
  onbellek = { ...tercihAnlik(), ...yeni };
  tercihleriYaz(onbellek);
  for (const fn of dinleyiciler) fn();
}
