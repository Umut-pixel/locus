/** Transitions.dev — input clear dissolve timing helpers */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function readCssNum(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name)
  );
  return Number.isFinite(v) ? v : fallback;
}

export function readCssEase(
  name: string
): (t: number) => number {
  if (typeof window === "undefined") return (t) => t;
  const str = getComputedStyle(document.documentElement).getPropertyValue(name);
  return cubicBezier(str);
}

/** Minimal cubic-bezier sampler so JS easing matches CSS. */
export function cubicBezier(str: string): (t: number) => number {
  const m = String(str).match(
    /cubic-bezier\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/
  );
  if (!m) return (t) => t;
  const [x1, y1, x2, y2] = m.slice(1).map(parseFloat);
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const dx = ((ax * s + bx) * s + cx) * s - t;
      const d = (3 * ax * s + 2 * bx) * s + cx;
      if (Math.abs(dx) < 1e-6 || d === 0) break;
      s -= dx / d;
    }
    return ((ay * s + by) * s + cy) * s;
  };
}

/** Per-word radial-gradient streak stack (light UI → charcoal/multiply, dark UI → white/screen). */
export function buildClearGlow(
  text: string,
  font: string,
  wrapWidth: number,
  padLeft: number
): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas").getContext("2d");
  if (!canvas) return "";
  canvas.font = font;
  const isDark = document.documentElement.classList.contains("dark");
  const rgb = isDark ? "255,255,255" : "28,29,32";
  const w = wrapWidth || 280;
  const spread = readCssNum("--glow-spread", 1.5);
  const layers: string[] = [];
  let x = 0;
  text.split(/(\s+)/).forEach((seg) => {
    const segW = canvas.measureText(seg).width;
    if (seg.trim()) {
      const cx = padLeft + x + segW / 2;
      const hw = Math.max(segW * 0.45, 8) * spread;
      (
        [
          [0, 0.8, 7, 0.22],
          [hw * 0.45, 0.55, 8, 0.18],
          [-hw * 0.4, 0.65, 6, 0.16],
          [hw * 0.15, 0.9, 5, 0.14],
        ] as const
      ).forEach(([dx, rwm, rh, a]) => {
        const lx = (((cx + dx) / w) * 100).toFixed(2);
        layers.push(
          `radial-gradient(ellipse ${Math.max(hw * rwm, 2).toFixed(1)}px ${rh}px at ${lx}% 100%, rgba(${rgb},${a}), transparent)`
        );
      });
    }
    x += segW;
  });
  return layers.join(", ");
}
