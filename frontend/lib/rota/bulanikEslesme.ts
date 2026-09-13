/**
 * AI'nın metinle söylediği bir ismi (`sorgu`) ekranda görünen bir kayıtla
 * eşler. Model dahili kodları hiçbir zaman bilemez (bkz.
 * `RotaHaritaEylemBaglami`, `RotaOnerisiBaglami`, `agentBaglami.ts`) — yalnız
 * görünen ADI verir, burası bulanık eşler. Tam eşleşme öncelikli; yoksa
 * alt-dize eşleşmesi (iki yönlü, "Aydın" da "Aydın Merkez" de eşleşsin diye).
 *
 * `harita/page.tsx`'teki `haritaEylemiUygula` (salt-okunur navigasyon) ve
 * `RotaOnerisiBaglami`'nin çözümleyicisi (veri mutasyonu) aynı fonksiyonu
 * paylaşır — iki yerde ayrı ayrı tanımlanırsa eşleşme davranışı sessizce
 * ayrışabilirdi.
 */
export function bulanikBul<T>(liste: T[], sorgu: string, adGetir: (item: T) => string): T | null {
  const q = sorgu.trim().toLocaleLowerCase("tr-TR");
  if (!q) return null;
  let kismi: T | null = null;
  for (const item of liste) {
    const ad = adGetir(item).toLocaleLowerCase("tr-TR");
    if (ad === q) return item;
    if (!kismi && (ad.includes(q) || q.includes(ad))) kismi = item;
  }
  return kismi;
}
