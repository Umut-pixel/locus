/**
 * Planlama tercihleri — kullanıcının seçtiği, etkisi ölçülen ayarlar.
 *
 * Hepsi saf veri; planı `planla.ts` üretir, etkisini `metrik.ts` ölçer.
 * Tarayıcıda saklanır ki her açılışta yeniden ayarlanmasın.
 */

/** Durakları araçlara dağıtma yöntemi. */
export type Strateji = "sweep" | "ffd";

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
  /** Uzak duraklar şehir içi turla aynı araca binmesin. */
  uzakAyir: boolean;
  /** null = filoyu sistem seçsin. Dizi = elle seçilmiş araç kodları. */
  aracKodlari: string[] | null;
}

/**
 * Sunucu render'ının ve hydration'ın ilk karesinde kullanılan değer.
 * Referansı SABİT olmalı — `useSyncExternalStore` her çağrıda yeni nesne
 * görürse sonsuz render döngüsüne girer.
 */
export const VARSAYILAN_TERCIHLER: Tercihler = Object.freeze({
  gunPenceresi: null,
  strateji: "sweep",
  dolulukEsigi: 70,
  uzakAyir: false,
  aracKodlari: null,
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

const ANAHTAR = "rota-tercihleri-v1";

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
    strateji: o.strateji === "ffd" ? "ffd" : "sweep",
    dolulukEsigi:
      Number.isFinite(esik) && esik >= 0 && esik <= 100
        ? esik
        : VARSAYILAN_TERCIHLER.dolulukEsigi,
    uzakAyir: o.uzakAyir === true,
    aracKodlari: Array.isArray(o.aracKodlari)
      ? o.aracKodlari.filter((k): k is string => typeof k === "string")
      : null,
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
