/**
 * Rapor sayfaları için genel modül-seviyesi bellek cache — sayfa
 * değiştirip geri dönüldüğünde boş ekran/yeniden fetch olmasın diye.
 * Deseni musteri-cache.ts'ten (harita) alır; burada tek dosyada genelleştirilmiş
 * hali — finansal/sevkiyat/stok raporları kendi anahtarlarıyla kullanır.
 */

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getReportCache<T>(key: string): T | null {
  const entry = store.get(key);
  return entry ? (entry.data as T) : null;
}

export function isReportCacheFresh(key: string): boolean {
  const entry = store.get(key);
  return Boolean(entry && Date.now() - entry.cachedAt <= TTL_MS);
}

export function setReportCache<T>(key: string, data: T): void {
  store.set(key, { data, cachedAt: Date.now() });
}

export function clearReportCache(key: string): void {
  store.delete(key);
}
