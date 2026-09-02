/**
 * Dönem (tarih aralığı) — tüm rapor sayfalarının ortak takvimi.
 *
 * NEDEN TEK DOSYA
 *   `istanbulIsoGun` bu projede dört ayrı yerde kopyalanmıştı
 *   (useFinansalRaporu, useTahsilatRaporu, useMusteriRaporlama, sync/parse-tahsilat)
 *   ve kopyaların yanında UTC ile hesaplayan beş ayrı yer daha vardı. UTC ile
 *   hesaplamak Türkiye'de 00:00–03:00 arası günü bir geri kaydırıyor;
 *   useMusteriRaporlama.ts içindeki yorum bu hatanın bir kez yaşandığını ve
 *   düzeltildiğini belgeliyor, ama düzeltme diğer sayfalara uygulanmamıştı.
 *   Operasyon takvimi tarayıcının saat dilimi değil, **Europe/Istanbul**.
 *
 * SÖZLEŞME
 *   Aralık daima yarı açık: [bas, bitisHaric). Üst sınır HARİÇ.
 *   Bu, gün sınırında çift sayımı imkânsız kılar ve ardışık dönemler
 *   (bu ay / geçen ay) tam olarak birleşir, çakışmaz.
 *
 * Tarihler her yerde ISO `YYYY-MM-DD` metni. Bu format leksikografik olarak
 * sıralanabilir, dolayısıyla hem string karşılaştırmasıyla hem de Supabase
 * `date` kolonlarıyla (`islem_tarihi_d`) doğrudan çalışır.
 */

export type DonemPreset =
  | "bugun"
  | "dun"
  | "son7"
  | "son30"
  | "son90"
  | "buAy"
  | "gecenAy"
  | "buYil"
  | "ozel";

export interface DonemAraligi {
  /** Dahil (inclusive) alt sınır — ISO `YYYY-MM-DD`. */
  bas: string;
  /** HARİÇ (exclusive) üst sınır — ISO `YYYY-MM-DD`. */
  bitisHaric: string;
  preset: DonemPreset;
  /** Ekranda gösterilecek okunabilir etiket (örn. "Son 30 gün"). */
  etiket: string;
}

/**
 * Varsayılan dönem: son 30 gün (kayan).
 *
 * Bilinçli tercih — "ay başından bugüne" ayın 1'inde neredeyse boş bir ekran
 * veriyordu ve önceki ayın rakamına dönmenin yolu yoktu (bkz.
 * sql/panorama_tarih_normalizasyon.sql başlığı). Kayan pencere ay dönümünde
 * asla boşalmaz; "bu ay" seçeneği dropdown'da duruyor.
 */
export const VARSAYILAN_DONEM: DonemPreset = "son30";

// ---------------------------------------------------------------------------
// Takvim ilkelleri — hepsi Europe/Istanbul
// ---------------------------------------------------------------------------

const ISTANBUL_GUN_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** İstanbul takvim günü, ISO `YYYY-MM-DD`. Tarayıcı TZ / UTC değil. */
export function istanbulIsoGun(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    ISTANBUL_GUN_FORMATTER.formatToParts(now).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ayrist(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y!, m!, d!];
}

function iso(y: number, m: number, d: number): string {
  // Date.UTC taşmayı kendisi normalize eder (ay 13 -> ertesi yıl ocak).
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

/** ISO güne gün ekler/çıkarır. Ay ve yıl sınırlarını kendi aşar. */
export function gunEkle(isoGun: string, delta: number): string {
  const [y, m, d] = ayrist(isoGun);
  return iso(y, m, d + delta);
}

/**
 * ISO güne ay ekler/çıkarır. Hedef ayda o gün yoksa ayın son gününe kırpar
 * (31 Mart − 1 ay = 28/29 Şubat) — takvim aritmetiğinin standart davranışı.
 */
export function ayEkle(isoGun: string, delta: number): string {
  const [y, m, d] = ayrist(isoGun);
  const hedefAyinSonGunu = new Date(Date.UTC(y, m - 1 + delta + 1, 0)).getUTCDate();
  return iso(y, m + delta, Math.min(d, hedefAyinSonGunu));
}

/** Aralıktaki gün sayısı (yarı açık olduğu için basit fark). */
export function gunSayisi(a: Pick<DonemAraligi, "bas" | "bitisHaric">): number {
  const bas = Date.parse(`${a.bas}T00:00:00Z`);
  const bit = Date.parse(`${a.bitisHaric}T00:00:00Z`);
  return Math.round((bit - bas) / 86400000);
}

// ---------------------------------------------------------------------------
// Etiketleme
// ---------------------------------------------------------------------------

const GUN_AY_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

const GUN_AY_YIL_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const AY_YIL_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

function tarihNesnesi(isoGun: string): Date {
  const [y, m, d] = ayrist(isoGun);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Ay adı + yıl — "Ağustos 2026". */
export function ayEtiketi(isoGun: string): string {
  return AY_YIL_FORMATTER.format(tarihNesnesi(isoGun));
}

/**
 * Aralığın okunabilir hâli. Üst sınır hariç olduğu için gösterimde bir gün
 * geri alınır: [2026-08-03, 2026-09-03) -> "3 Ağu – 2 Eyl 2026".
 */
export function araligiEtiketle(bas: string, bitisHaric: string): string {
  const sonGun = gunEkle(bitisHaric, -1);
  if (sonGun < bas) return araligiEtiketle(bas, gunEkle(bas, 1));
  if (bas === sonGun) return GUN_AY_YIL_FORMATTER.format(tarihNesnesi(bas));

  const ayniYil = bas.slice(0, 4) === sonGun.slice(0, 4);
  const basMetin = ayniYil
    ? GUN_AY_FORMATTER.format(tarihNesnesi(bas))
    : GUN_AY_YIL_FORMATTER.format(tarihNesnesi(bas));
  return `${basMetin} – ${GUN_AY_YIL_FORMATTER.format(tarihNesnesi(sonGun))}`;
}

// ---------------------------------------------------------------------------
// Dönem hesabı
// ---------------------------------------------------------------------------

export interface DonemSecenegi {
  preset: DonemPreset;
  etiket: string;
}

/** Dropdown sırası — sık kullanılandan geniş pencereye. */
export const DONEM_SECENEKLERI: DonemSecenegi[] = [
  { preset: "bugun", etiket: "Bugün" },
  { preset: "dun", etiket: "Dün" },
  { preset: "son7", etiket: "Son 7 gün" },
  { preset: "son30", etiket: "Son 30 gün" },
  { preset: "son90", etiket: "Son 90 gün" },
  { preset: "buAy", etiket: "Bu ay" },
  { preset: "gecenAy", etiket: "Geçen ay" },
  { preset: "buYil", etiket: "Bu yıl" },
  { preset: "ozel", etiket: "Özel aralık" },
];

export interface DonemSecenekleri {
  /** Test edilebilirlik için enjekte edilebilir "şimdi". */
  now?: Date;
  /** `preset: "ozel"` için kullanıcının seçtiği DAHİL başlangıç/bitiş günleri. */
  ozelBas?: string;
  ozelBitisDahil?: string;
}

/**
 * Preset'ten yarı açık aralık üretir. Tüm sınırlar İstanbul takvimine göre.
 *
 * "Son N gün" bugünü DE kapsar: son 7 gün = bugün dahil 7 takvim günü.
 */
export function donemAraligi(
  preset: DonemPreset,
  secenekler: DonemSecenekleri = {}
): DonemAraligi {
  const bugun = istanbulIsoGun(secenekler.now);
  const yarin = gunEkle(bugun, 1);
  const etiketi = (p: DonemPreset) =>
    DONEM_SECENEKLERI.find((s) => s.preset === p)?.etiket ?? p;

  switch (preset) {
    case "bugun":
      return { bas: bugun, bitisHaric: yarin, preset, etiket: "Bugün" };

    case "dun": {
      const dun = gunEkle(bugun, -1);
      return { bas: dun, bitisHaric: bugun, preset, etiket: "Dün" };
    }

    case "son7":
    case "son30":
    case "son90": {
      const gun = preset === "son7" ? 7 : preset === "son30" ? 30 : 90;
      return {
        bas: gunEkle(bugun, -(gun - 1)),
        bitisHaric: yarin,
        preset,
        etiket: etiketi(preset),
      };
    }

    case "buAy":
      return {
        bas: `${bugun.slice(0, 7)}-01`,
        bitisHaric: yarin,
        preset,
        etiket: `${ayEtiketi(bugun)} (ay başından bugüne)`,
      };

    case "gecenAy": {
      const buAyinBasi = `${bugun.slice(0, 7)}-01`;
      const gecenAyinBasi = ayEkle(buAyinBasi, -1);
      return {
        bas: gecenAyinBasi,
        bitisHaric: buAyinBasi,
        preset,
        etiket: ayEtiketi(gecenAyinBasi),
      };
    }

    case "buYil":
      return {
        bas: `${bugun.slice(0, 4)}-01-01`,
        bitisHaric: yarin,
        preset,
        etiket: `${bugun.slice(0, 4)} (yıl başından bugüne)`,
      };

    case "ozel": {
      // Kullanıcı bitiş gününü DAHİL seçer; sözleşme hariç olduğu için +1 gün.
      const bas = secenekler.ozelBas ?? bugun;
      const bitisDahil = secenekler.ozelBitisDahil ?? bas;
      const [erken, gec] = bas <= bitisDahil ? [bas, bitisDahil] : [bitisDahil, bas];
      const bitisHaric = gunEkle(gec, 1);
      return { bas: erken, bitisHaric, preset, etiket: araligiEtiketle(erken, bitisHaric) };
    }
  }
}

/**
 * Karşılaştırma penceresi — seçili dönemin hemen öncesi.
 *
 * Takvim tabanlı preset'ler bir takvim birimi geri kayar; gün sayısı tabanlı
 * olanlar eşit uzunlukta geri kayar. "Bu ay" için sonuç, geçen ayın AYNI
 * gününe kadar olan dilimdir — tam ay ile kıyaslamak haksız olurdu
 * (2 Eylül'ün 2 günü, Ağustos'un 31 gününe karşı).
 */
export function oncekiDonem(a: DonemAraligi): DonemAraligi {
  if (a.preset === "buAy" || a.preset === "gecenAy") {
    const bas = ayEkle(a.bas, -1);
    const bitisHaric = ayEkle(a.bitisHaric, -1);
    return { bas, bitisHaric, preset: a.preset, etiket: araligiEtiketle(bas, bitisHaric) };
  }

  if (a.preset === "buYil") {
    const geriYil = (g: string) => `${Number(g.slice(0, 4)) - 1}${g.slice(4)}`;
    const bas = geriYil(a.bas);
    const bitisHaric = geriYil(a.bitisHaric);
    return { bas, bitisHaric, preset: a.preset, etiket: araligiEtiketle(bas, bitisHaric) };
  }

  const n = gunSayisi(a);
  const bas = gunEkle(a.bas, -n);
  return {
    bas,
    bitisHaric: a.bas,
    preset: a.preset,
    etiket: araligiEtiketle(bas, a.bas),
  };
}

/** Bir ISO günün aralığa girip girmediği. Yarı açık: [bas, bitisHaric). */
export function donemdeMi(isoGun: string | null | undefined, a: DonemAraligi): boolean {
  if (!isoGun) return false;
  return isoGun >= a.bas && isoGun < a.bitisHaric;
}

/**
 * Seçili dönem + karşılaştırma dönemini birlikte kapsayan tek aralık.
 *
 * Sunucudan iki ayrı tur istek yerine tek geniş çekim yapılır, iki pencere
 * client'ta `donemdeMi` ile ayrılır — mevcut `fetchAllRows` yapısını bozmadan
 * istek sayısını yarıya indirir.
 */
export function karsilastirmaKapsami(a: DonemAraligi): { bas: string; bitisHaric: string } {
  return { bas: oncekiDonem(a).bas, bitisHaric: a.bitisHaric };
}

/**
 * Değişim oranı. Önceki dönem 0 ise `null` — "%∞" göstermek yerine
 * çağıran taraf "—" basar.
 */
export function degisimOrani(simdi: number, onceki: number): number | null {
  if (!Number.isFinite(simdi) || !Number.isFinite(onceki) || onceki === 0) return null;
  return (simdi - onceki) / Math.abs(onceki);
}
