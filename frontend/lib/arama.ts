/**
 * Liste içi metin araması — Türkçe duyarlı, aksan toleranslı.
 *
 * Neden `toLocaleLowerCase("tr-TR")` tek başına yetmiyor: doğru İ→i / I→ı
 * dönüşümünü yapıyor ama diakritiği koruyor. Kullanıcı klavyeden çoğunlukla
 * ASCII yazıyor ("bornova sisli" gibi) ve veri "Şişli" tutuyor; katlama
 * yapılmazsa hiç eşleşmez. Bu yüzden tr-TR küçük harften SONRA
 * ı/ğ/ü/ş/ö/ç → i/g/u/s/o/c indirgemesi de yapılıyor.
 *
 * Sözleşme çift yönlü: hem sorgu hem veri aynı fonksiyondan geçtiği için
 * "ŞİŞLİ", "sisli", "Şişli" ve "SISLI" aynı anahtara gider.
 */

const TR_HARITA: Record<string, string> = {
  ı: "i",
  ğ: "g",
  ü: "u",
  ş: "s",
  ö: "o",
  ç: "c",
  â: "a",
  î: "i",
  û: "u",
};

/** Aramada karşılaştırılacak kanonik biçim. */
export function aramaAnahtari(deger: unknown): string {
  if (deger == null) return "";
  return String(deger)
    .toLocaleLowerCase("tr-TR")
    .replace(/[ığüşöçâîû]/g, (h) => TR_HARITA[h] ?? h)
    .normalize("NFKD")
    // Ayrışan birleşik aksan işaretleri (U+0300–U+036F). Kaçış dizisiyle
    // yazılıyor: kaynağa düz birleşik karakter koymak editör/kodlama
    // geçişlerinde sessizce bozuluyor.
    .replace(new RegExp("[\u0300-\u036f]", "g"), "")
    .trim();
}

/**
 * Sorguyu boşluklardan bölüp HER parçanın eşleşmesini arar (AND).
 *
 * "ahmet izmir" yazınca İzmir'deki Ahmet'i bulmak isteniyor; tek dize olarak
 * aransa alan sınırına takılıp hiç eşleşmezdi. Tek tek alan yerine alanları
 * birleştirip aramak, kullanıcının hangi alanın nerede olduğunu bilmesini
 * gerektirmiyor.
 */
export function aramaEslesiyor(sorgu: string, alanlar: readonly unknown[]): boolean {
  const parcalar = aramaAnahtari(sorgu).split(/\s+/).filter(Boolean);
  if (parcalar.length === 0) return true;

  const samanlik = alanlar.map(aramaAnahtari).filter(Boolean).join(" ");
  if (!samanlik) return false;

  return parcalar.every((p) => samanlik.includes(p));
}

/**
 * Liste filtresi. Sorgu boşsa **aynı dizi referansı** döner — gereksiz
 * yeniden render ve `useMemo` zincirinin boşuna tetiklenmesi olmasın.
 */
export function aramaFiltrele<T>(
  liste: readonly T[],
  sorgu: string,
  alanlar: (item: T) => readonly unknown[]
): readonly T[] {
  if (!sorgu.trim()) return liste;
  return liste.filter((item) => aramaEslesiyor(sorgu, alanlar(item)));
}
