/**
 * Doluluk yüzdesine göre yeşilden kırmızıya yumuşak ton geçişi.
 *
 * Ham RGB/HSL yerine ev renk token'ları (`--success`/`--caution`/
 * `--destructive`, globals.css) `color-mix(in oklch, …)` ile karıştırılıyor —
 * hem tema (açık/koyu) otomatik doğru renk verir hem de proje genelindeki
 * "ham renk kullanma" kuralına uyar (bkz. uyarı rengi token belleği).
 *
 * %60 ve altı → düz yeşil. %60-85 → yeşilden sarıya. %85-100(+) → sarıdan
 * kırmızıya. 100'ün üstü düz kırmızı (aşım zaten aşım, daha da "kırmızı"sı
 * yok).
 */
export function dolulukTonu(yuzdeHam: number): string {
  const yuzde = Number.isFinite(yuzdeHam) ? yuzdeHam : 0;
  if (yuzde <= 60) return "var(--success)";
  if (yuzde >= 100) return "var(--destructive)";
  if (yuzde <= 85) {
    const t = Math.round(((yuzde - 60) / 25) * 100);
    return `color-mix(in oklch, var(--caution) ${t}%, var(--success))`;
  }
  const t = Math.round(((yuzde - 85) / 15) * 100);
  return `color-mix(in oklch, var(--destructive) ${t}%, var(--caution))`;
}
