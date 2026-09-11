/**
 * Bölge/rut renkleri — pool listesi, bölge özeti ve araç kartlarındaki bölge
 * rozetleri AYNI paleti kullanır ki "bu bölge nerede görünüyor" ekranlar
 * arasında görsel olarak takip edilebilsin. Ekran çok "mono" duruyordu —
 * bölge adları hep aynı gri metindi, hangi sipariş hangi bölgeye ait sadece
 * okuyarak anlaşılıyordu.
 *
 * Araç renklerinden (`RotaHaritasi.ARAC_RENKLERI`) BİLEREK ayrı bir aile:
 * bir kartta hem "bu araç" rengi hem "bu bölge" rengi yan yana görünebiliyor,
 * ikisi karışırsa hangisinin ne anlama geldiği belirsizleşir.
 */

/** İzmir rutları hep AYNI 6 renkten birini alır — gün değişse de sabit kalır. */
const IZMIR_RUT_RENKLERI: Readonly<Record<string, string>> = {
  "izmir-rut-1": "#0ea5e9", // Kuzey — sky
  "izmir-rut-2": "#22c55e", // Kuzey/Merkez — yeşil
  "izmir-rut-3": "#f97316", // Küçük Menderes — turuncu
  "izmir-rut-4": "#e11d48", // Güney — pembe/kırmızı
  "izmir-rut-5": "#8b5cf6", // Yarımada — mor
  "izmir-rut-6": "#ca8a04", // Merkez — hardal
};

/**
 * RUT olmayan (genel bant/açı) bölgeler için dönen palet. Sıra sabit; her
 * bölge kodu hash'lenip buradan bir renk seçiyor, o yüzden aynı bölge aynı
 * oturumda hep aynı renkte kalıyor.
 */
const GENEL_BOLGE_RENKLERI: readonly string[] = [
  "#64748b", // slate
  "#0891b2", // cyan
  "#65a30d", // lime
  "#c026d3", // fuchsia
  "#0d9488", // teal
  "#9333ea", // mor
  "#b91c1c", // kırmızı (koyu)
  "#4338ca", // indigo
  "#a16207", // amber (koyu)
  "#be185d", // rose (koyu)
];

function metinHash(deger: string): number {
  let h = 0;
  for (let i = 0; i < deger.length; i++) {
    h = (h * 31 + deger.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Bölge koduna göre sabit renk. `kod` değişmediği sürece (aynı gün, aynı
 * havuz) dönen renk de değişmez — ekranlar arasında ve yeniden hesaplamalar
 * arasında tutarlı kalır.
 */
export function bolgeRengi(kod: string): string {
  const rutRengi = IZMIR_RUT_RENKLERI[kod];
  if (rutRengi) return rutRengi;
  return GENEL_BOLGE_RENKLERI[metinHash(kod) % GENEL_BOLGE_RENKLERI.length]!;
}
