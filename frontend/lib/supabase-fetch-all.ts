/**
 * PostgREST varsayılan olarak .range()/.limit() verilmezse yanıtı sessizce
 * 1000 satırda keser (bu projede ölçüldü, bkz. RAPORLAMA-SAYFASI.md §4).
 * "Filtreye uyan TÜM satırlar" gereken her yerde (özet, dışa aktarma,
 * şirket geneli agregasyon) dolana kadar 1000'lik turlarla çekilir.
 */
export const FETCH_ALL_BATCH_SIZE = 1000;
export const FETCH_ALL_MAX_BATCHES = 5;

interface FetchAllQueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Bir sorgunun TÜM satırlarını 1000'lik turlarla toplar. `buildQuery` her
 * turda `[from, to]` aralığıyla çağrılır — .range() dışındaki tüm
 * filtre/sıralama/abortSignal çağıran tarafın sorumluluğunda.
 *
 * `useMusteriRaporlama.ts`, `useFinansalRaporu.ts` ve `useSevkiyatRaporu.ts`
 * arasında paylaşılan tek kopya — aynı 1000 satır kesilme riski her satır
 * bazlı Panorama view'ında (belge_detay, açık fatura, sevkiyat) geçerli.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<FetchAllQueryResult<T>>,
  options?: { batchSize?: number; maxBatches?: number }
): Promise<T[]> {
  const batchSize = options?.batchSize ?? FETCH_ALL_BATCH_SIZE;
  const maxBatches = options?.maxBatches ?? FETCH_ALL_MAX_BATCHES;
  const results: T[] = [];
  let from = 0;

  for (let i = 0; i < maxBatches; i++) {
    const { data, error } = await buildQuery(from, from + batchSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    results.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return results;
}
