import gsap from "gsap";

type Theme = "light" | "dark";

const LIGHT_BG = "oklch(0.9821 0 0)";
const DARK_BG = "oklch(0.1776 0 0)";

let overlay: HTMLDivElement | null = null;
let running: gsap.core.Timeline | null = null;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function applyThemeClass(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

function ensureOverlay(): HTMLDivElement {
  if (overlay?.isConnected) return overlay;
  overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:0";
  document.body.appendChild(overlay);
  return overlay;
}

function teardownOverlay(): void {
  overlay?.remove();
  overlay = null;
  running = null;
}

/**
 * Tema sınıfını uygular. Hareket: tek katman, yalnız opacity (compositor).
 * View Transition varsa onu kullanır — tam sayfa CSS değişken tween'i yok.
 */
export function transitionTheme(next: Theme): void {
  if (reducedMotion()) {
    running?.kill();
    teardownOverlay();
    applyThemeClass(next);
    return;
  }

  // Mapbox canvas'ı View Transition / tam ekran overlay ile kasma.
  if (document.querySelector(".mapboxgl-canvas")) {
    running?.kill();
    teardownOverlay();
    applyThemeClass(next);
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (update: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === "function") {
    running?.kill();
    teardownOverlay();
    doc.startViewTransition(() => applyThemeClass(next));
    return;
  }

  running?.kill();
  const el = ensureOverlay();
  el.style.background = next === "dark" ? DARK_BG : LIGHT_BG;
  el.style.willChange = "opacity";

  running = gsap.timeline({
    onComplete: () => {
      el.style.willChange = "auto";
      teardownOverlay();
    },
  });
  running.set(el, { opacity: 0 });
  running.to(el, { opacity: 1, duration: 0.14, ease: "power2.in" });
  running.add(() => applyThemeClass(next));
  running.to(el, { opacity: 0, duration: 0.18, ease: "power2.out" });
}

export function spinThemeIcon(node: HTMLElement | null, toDark: boolean): void {
  if (!node || reducedMotion()) return;
  gsap.killTweensOf(node);
  gsap.fromTo(
    node,
    { rotate: toDark ? 40 : -40, scale: 0.82 },
    { rotate: 0, scale: 1, duration: 0.32, ease: "power3.out", overwrite: true }
  );
}
