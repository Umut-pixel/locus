/**
 * Grafik geometrisi — piksel uzayında ölçek, eğri ve eksen yardımcıları.
 *
 * Not: bu modül viewBox esnetmesi (preserveAspectRatio="none") varsayımıyla
 * çalışmaz; tüm koordinatlar gerçek CSS pikselidir. Metin bu yüzden yatayda
 * gerilmez, çizgi kalınlıkları da olduğu gibi çıkar.
 */

export type Pt = { x: number; y: number };

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Fritsch–Carlson monoton kübik interpolasyon. Klasik Catmull-Rom'un aksine
 * yerel uç değerleri aşmaz — yani veride olmayan tepe/çukur uydurmaz.
 */
export function monotoneLine(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const p0 = pts[0]!;
  if (n === 1) return `M${r(p0.x)},${r(p0.y)}`;
  if (n === 2) {
    const p1 = pts[1]!;
    return `M${r(p0.x)},${r(p0.y)} L${r(p1.x)},${r(p1.y)}`;
  }

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const h = b.x - a.x || 1e-6;
    dx.push(h);
    slope.push((b.y - a.y) / h);
  }

  const tangent: number[] = new Array(n).fill(0);
  tangent[0] = slope[0]!;
  tangent[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const s0 = slope[i - 1]!;
    const s1 = slope[i]!;
    if (s0 * s1 <= 0) {
      tangent[i] = 0;
      continue;
    }
    const w1 = 2 * dx[i]! + dx[i - 1]!;
    const w2 = dx[i]! + 2 * dx[i - 1]!;
    tangent[i] = (w1 + w2) / (w1 / s0 + w2 / s1);
  }

  let d = `M${r(p0.x)},${r(p0.y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const h = dx[i]! / 3;
    const c1x = a.x + h;
    const c1y = a.y + tangent[i]! * h;
    const c2x = b.x - h;
    const c2y = b.y - tangent[i + 1]! * h;
    d += ` C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(b.x)},${r(b.y)}`;
  }
  return d;
}

/** Çizgiyi bir taban çizgisine kapatır — dolgu için. */
export function closeToBaseline(line: string, pts: Pt[], baseY: number): string {
  if (!line || pts.length === 0) return "";
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${line} L${r(last.x)},${r(baseY)} L${r(first.x)},${r(baseY)} Z`;
}

/** 1 / 2 / 2.5 / 5 × 10ⁿ adım — okunur eksen değerleri. */
export function niceStep(span: number, count: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const factor = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return factor * mag;
}

export type Domain = { min: number; max: number; ticks: number[] };

/**
 * Veri aralığını temiz bir adıma oturtur; ilk ve son tick tam olarak plot
 * kenarına denk gelir, böylece üstteki ızgara çizgisi boşlukta asılı kalmaz.
 */
export function niceDomain(
  dataMin: number,
  dataMax: number,
  count = 4,
  headroom = 0.08
): Domain {
  let lo = Math.min(dataMin, dataMax);
  let hi = Math.max(dataMin, dataMax);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, ticks: [0, 1] };
  if (lo === hi) {
    const bump = Math.abs(lo) > 0 ? Math.abs(lo) * 0.5 : 1;
    lo -= bump;
    hi += bump;
  }

  // Veri zaten sıfıra dayanıyorsa o tarafa pay verme — yoksa hep pozitif bir
  // seride hayalet bir negatif tick beliriyor.
  const pad = (hi - lo) * headroom;
  const padLo = lo === 0 ? 0 : pad;
  const padHi = hi === 0 ? 0 : pad;
  const step = niceStep(hi - lo + padLo + padHi, count);
  const min = Math.floor((lo - padLo) / step) * step;
  const max = Math.ceil((hi + padHi) / step) * step;

  const ticks: number[] = [];
  const total = Math.round((max - min) / step);
  for (let i = 0; i <= total; i += 1) {
    const v = min + i * step;
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return { min, max, ticks };
}

const axisNumber = (digits: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits });

/** Eksen etiketi — ₺1,2 M / ₺450 B / ₺0. Başlıktaki tam tutarı tekrarlamaz. */
export function formatAxisTRY(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1) return "₺0";
  const sign = value < 0 ? "-" : "";
  const [scaled, suffix] =
    abs >= 1e9
      ? [abs / 1e9, " Mr"]
      : abs >= 1e6
        ? [abs / 1e6, " M"]
        : abs >= 1e3
          ? [abs / 1e3, " B"]
          : [abs, ""];
  const digits = suffix === "" || scaled >= 100 ? 0 : 1;
  return `${sign}₺${axisNumber(digits).format(scaled)}${suffix}`;
}

/** 10px eksen fontu için kaba genişlik — sol oluğu ölçmeye yeter. */
export function axisLabelWidth(labels: string[]): number {
  const longest = labels.reduce((a, s) => Math.max(a, s.length), 0);
  return Math.round(longest * 6.1);
}

/**
 * X eksen etiketlerini çakışmayacak sayıda seçer — genişlik büyüdükçe daha
 * fazla etiket, daralınca ilk/son ikilisine düşer.
 */
export function pickTickIndices(count: number, plotWidth: number, perLabel = 104): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const fits = clamp(Math.floor(plotWidth / perLabel), 2, 8);
  const wanted = Math.min(fits, count);
  const out: number[] = [];
  for (let k = 0; k < wanted; k += 1) {
    const i = wanted === 1 ? 0 : Math.round((k / (wanted - 1)) * (count - 1));
    if (out[out.length - 1] !== i) out.push(i);
  }
  return out;
}

function r(v: number): number {
  return Math.round(v * 10) / 10;
}
