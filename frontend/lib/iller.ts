/**
 * Türkiye illeri — plaka kodu ↔ il adı tek kaynağı.
 *
 * NEDEN PLAKA: harita → API → n8n arasındaki tel formatı **sayısal plaka**,
 * asla il adı değil. Türkçe İ/I katlaması tek bir yerde (burada) çözülür;
 * istemci bir string uydurup n8n'de sessizce sıfır ilçe eşleştiremez.
 *
 * ⚠️ `ad` alanları `ilce_merkezleri.il` ile **birebir** aynı yazılmalı.
 * Canlıda title-case + diakritik kullanılıyor: `İzmir`, `Muğla`, `Balıkesir`,
 * `Çanakkale`, `Uşak`. `lib/import/utils.ts` içindeki `sehirNormalize`
 * (BÜYÜK HARF) burada KULLANILMAZ — o ETL tarafının ayrı bir konvansiyonu.
 * Seed (backend/ilce_merkezleri_referans.csv) de bu listeye normalize edilir.
 */

export type Il = { readonly plaka: number; readonly ad: string };

export const IL_LISTESI: readonly Il[] = [
  { plaka: 1, ad: "Adana" },
  { plaka: 2, ad: "Adıyaman" },
  { plaka: 3, ad: "Afyonkarahisar" },
  { plaka: 4, ad: "Ağrı" },
  { plaka: 5, ad: "Amasya" },
  { plaka: 6, ad: "Ankara" },
  { plaka: 7, ad: "Antalya" },
  { plaka: 8, ad: "Artvin" },
  { plaka: 9, ad: "Aydın" },
  { plaka: 10, ad: "Balıkesir" },
  { plaka: 11, ad: "Bilecik" },
  { plaka: 12, ad: "Bingöl" },
  { plaka: 13, ad: "Bitlis" },
  { plaka: 14, ad: "Bolu" },
  { plaka: 15, ad: "Burdur" },
  { plaka: 16, ad: "Bursa" },
  { plaka: 17, ad: "Çanakkale" },
  { plaka: 18, ad: "Çankırı" },
  { plaka: 19, ad: "Çorum" },
  { plaka: 20, ad: "Denizli" },
  { plaka: 21, ad: "Diyarbakır" },
  { plaka: 22, ad: "Edirne" },
  { plaka: 23, ad: "Elazığ" },
  { plaka: 24, ad: "Erzincan" },
  { plaka: 25, ad: "Erzurum" },
  { plaka: 26, ad: "Eskişehir" },
  { plaka: 27, ad: "Gaziantep" },
  { plaka: 28, ad: "Giresun" },
  { plaka: 29, ad: "Gümüşhane" },
  { plaka: 30, ad: "Hakkâri" },
  { plaka: 31, ad: "Hatay" },
  { plaka: 32, ad: "Isparta" },
  { plaka: 33, ad: "Mersin" },
  { plaka: 34, ad: "İstanbul" },
  { plaka: 35, ad: "İzmir" },
  { plaka: 36, ad: "Kars" },
  { plaka: 37, ad: "Kastamonu" },
  { plaka: 38, ad: "Kayseri" },
  { plaka: 39, ad: "Kırklareli" },
  { plaka: 40, ad: "Kırşehir" },
  { plaka: 41, ad: "Kocaeli" },
  { plaka: 42, ad: "Konya" },
  { plaka: 43, ad: "Kütahya" },
  { plaka: 44, ad: "Malatya" },
  { plaka: 45, ad: "Manisa" },
  { plaka: 46, ad: "Kahramanmaraş" },
  { plaka: 47, ad: "Mardin" },
  { plaka: 48, ad: "Muğla" },
  { plaka: 49, ad: "Muş" },
  { plaka: 50, ad: "Nevşehir" },
  { plaka: 51, ad: "Niğde" },
  { plaka: 52, ad: "Ordu" },
  { plaka: 53, ad: "Rize" },
  { plaka: 54, ad: "Sakarya" },
  { plaka: 55, ad: "Samsun" },
  { plaka: 56, ad: "Siirt" },
  { plaka: 57, ad: "Sinop" },
  { plaka: 58, ad: "Sivas" },
  { plaka: 59, ad: "Tekirdağ" },
  { plaka: 60, ad: "Tokat" },
  { plaka: 61, ad: "Trabzon" },
  { plaka: 62, ad: "Tunceli" },
  { plaka: 63, ad: "Şanlıurfa" },
  { plaka: 64, ad: "Uşak" },
  { plaka: 65, ad: "Van" },
  { plaka: 66, ad: "Yozgat" },
  { plaka: 67, ad: "Zonguldak" },
  { plaka: 68, ad: "Aksaray" },
  { plaka: 69, ad: "Bayburt" },
  { plaka: 70, ad: "Karaman" },
  { plaka: 71, ad: "Kırıkkale" },
  { plaka: 72, ad: "Batman" },
  { plaka: 73, ad: "Şırnak" },
  { plaka: 74, ad: "Bartın" },
  { plaka: 75, ad: "Ardahan" },
  { plaka: 76, ad: "Iğdır" },
  { plaka: 77, ad: "Yalova" },
  { plaka: 78, ad: "Karabük" },
  { plaka: 79, ad: "Kilis" },
  { plaka: 80, ad: "Osmaniye" },
  { plaka: 81, ad: "Düzce" },
];

/**
 * Peritas'ın bugün müşterisi olan ve `ilce_merkezleri`'nde ilçesi bulunan
 * iller (Ege). Yalnızca bilgilendirme/sıralama için — gerçek kapsam kontrolü
 * her zaman canlı `ilce_merkezleri` sorgusuyla yapılır (bkz. API önizlemesi),
 * çünkü seed ilerledikçe bu liste eskir.
 */
export const CEKIRDEK_PLAKALAR: readonly number[] = [9, 10, 17, 20, 35, 45, 48, 64];

/**
 * Türkçe duyarlı katlama. `toLocaleUpperCase("tr-TR")` tek başına yetmez:
 * `i` → `İ` ve `ı` → `I` ayrı harflere gider, yani "IZMIR" ile "İzmir"
 * eşleşmez. Önce tr-TR küçük harfe indirip `ı`→`i` yapıp sonra düz
 * `toUpperCase()` almak iki yazımı da aynı anahtara taşır.
 * Aynı algoritma n8n `Build Nearby Cells` düğümünde de var — ikisi eşleşmezse
 * tarama sessizce sıfır ilçe bulur.
 */
export function ilAnahtar(ad: string): string {
  return String(ad ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/̂/g, "") // birleşik şapka (Hakkâri gibi)
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .toUpperCase()
    .trim();
}

const PLAKA_ILE = new Map(IL_LISTESI.map((i) => [i.plaka, i]));
const AD_ILE = new Map(IL_LISTESI.map((i) => [ilAnahtar(i.ad), i]));

/** Plakadan kanonik il adı. Geçersiz plaka → null. */
export function ilAdi(plaka: number): string | null {
  return PLAKA_ILE.get(plaka)?.ad ?? null;
}

/** İl adından plaka. Türkçe yazım farklarını tolere eder. Bulunamazsa null. */
export function plakaBul(ad: string): number | null {
  return AD_ILE.get(ilAnahtar(ad))?.plaka ?? null;
}

/** Plaka gerçekten 1-81 arası bir tam sayı mı. */
export function gecerliPlaka(deger: unknown): deger is number {
  return (
    typeof deger === "number" &&
    Number.isInteger(deger) &&
    deger >= 1 &&
    deger <= 81
  );
}
