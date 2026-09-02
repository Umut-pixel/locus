/**
 * Operasyon sabitleri ve gün uzunluğu hesabı — saf fonksiyonlar, ağ çağrısı yok.
 *
 * Değerlerin tamamı Melih Sarıcaoğulu'nun 2026-09-02 teyidinden geliyor;
 * tahmin yok. Tek yerde durmalarının sebebi, sürüş süresini kullanan üç ayrı
 * yerin (araç kartı, özet şeridi, Google isteği) aynı sayıyı kullanması.
 */

/** Bir müşteride ortalama boşaltma süresi. Melih: "15 dk". */
export const DURAK_SERVIS_DK = 15;

/** Araç depodan bu saatte çıkıyor. Melih: "sabah 08:30-09:00 arası". */
export const KALKIS_SAATI = 8;
export const KALKIS_DAKIKA = 30;

/**
 * Takograflı araçta kesintisiz sürüş sınırı ve zorunlu mola.
 * Melih: "isuzularda takograf cihazı var, bir şoför kesintisiz maksimum
 * 4.5 saat araç kullanabilir sonrasında en az yarım saat mola vermek zorunda."
 */
export const TAKOGRAF_SURUS_SINIRI_SN = 4.5 * 3600;
export const TAKOGRAF_MOLA_SN = 30 * 60;

/**
 * Bu yüzdenin altında doluluk "yarı boş çıkıyor" uyarısı verir.
 * Melih: "genelde araçlar dolmadan rut'a göndermeyi tercih etmiyoruz ama
 * ekstrem durumlarda kapasite altında da çıkabiliyor" — yani engel değil, uyarı.
 */
export const DUSUK_DOLULUK_ESIGI = 70;

/** Pazar sevkiyat yok. Melih: "pazar hariç her gün". `Date.getDay()` değeri. */
const PAZAR = 0;

/** Sevkiyat yapılan bir gün mü? */
export function sevkiyatGunuMu(tarih: Date): boolean {
  return tarih.getDay() !== PAZAR;
}

/**
 * Planın hedeflediği ilk sevkiyat kalkışı — bugün 08:30 henüz geçmediyse
 * bugün, aksi halde sonraki sevkiyat günü. Pazar atlanır.
 *
 * Google'a gönderilen `departureTime` bu; trafik tahmini kalkış saatine göre
 * hesaplandığı için "şimdi"yi göndermek akşam yapılan planlamada yanlış
 * süre üretiyordu.
 */
export function sonrakiKalkis(simdi: Date = new Date()): Date {
  const aday = new Date(simdi);
  aday.setHours(KALKIS_SAATI, KALKIS_DAKIKA, 0, 0);

  if (aday.getTime() <= simdi.getTime()) {
    aday.setDate(aday.getDate() + 1);
  }
  while (!sevkiyatGunuMu(aday)) {
    aday.setDate(aday.getDate() + 1);
  }
  return aday;
}

export interface GunUzunlugu {
  /** Google'dan gelen saf sürüş süresi. */
  surusSaniye: number;
  /** durak × 15 dk. */
  servisSaniye: number;
  /** Takograf molası — gerekmiyorsa 0. */
  molaSaniye: number;
  /** Depodan çıkıştan depoya dönüşe kadar toplam. */
  toplamSaniye: number;
}

/**
 * Bir turun gerçek gün uzunluğu. Google yalnız SÜRÜŞ süresini veriyor;
 * boşaltma ve zorunlu mola eklenmezse tur olduğundan kısa görünür ve "bu
 * güne sığar mı" sorusu yanlış cevaplanır.
 */
export function gunUzunlugu(params: {
  surusSaniye: number;
  durakSayisi: number;
  takograf: boolean;
}): GunUzunlugu {
  const { surusSaniye, durakSayisi, takograf } = params;

  const servisSaniye = Math.max(0, durakSayisi) * DURAK_SERVIS_DK * 60;
  const molaSaniye =
    takograf && surusSaniye > TAKOGRAF_SURUS_SINIRI_SN ? TAKOGRAF_MOLA_SN : 0;

  return {
    surusSaniye,
    servisSaniye,
    molaSaniye,
    toplamSaniye: surusSaniye + servisSaniye + molaSaniye,
  };
}

/** Kalkış + tur süresi. Araç kartındaki "08:30 → 15:40" için. */
export function varisZamani(kalkis: Date, toplamSaniye: number): Date {
  return new Date(kalkis.getTime() + toplamSaniye * 1000);
}

/** "08:30" biçiminde yerel saat. */
export function saatMetni(tarih: Date): string {
  const ss = String(tarih.getHours()).padStart(2, "0");
  const dd = String(tarih.getMinutes()).padStart(2, "0");
  return `${ss}:${dd}`;
}
