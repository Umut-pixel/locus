import gsap from "gsap";

import { hasLiveMapCanvas, withMapVeil } from "@/lib/map-curtain";
import { THEME_STORAGE_KEY, type ThemeName } from "@/lib/theme-preference";

type Theme = ThemeName;

const LIGHT_BG = "#f7f7f7";
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
  try {
    document.cookie = `${THEME_STORAGE_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* private mode */
  }
}

function ensureOverlay(): HTMLDivElement {
  if (overlay?.isConnected) return overlay;
  overlay = document.createElement("div");
  overlay.className = "locus-map-veil";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);
  return overlay;
}

function teardownOverlay(): void {
  overlay?.remove();
  overlay = null;
  running = null;
}

/**
 * Tema sınıfını uygular. Harita varken GPU perdesi: in → commit → idle → kalk.
 * Harita yoksa View Transition veya aynı compositor opacity perdesi.
 */
export function transitionTheme(next: Theme, commit?: () => void): void {
  const apply = () => {
    applyThemeClass(next);
    commit?.();
  };

  if (reducedMotion()) {
    running?.kill();
    teardownOverlay();
    apply();
    return;
  }

  if (hasLiveMapCanvas()) {
    running?.kill();
    teardownOverlay();
    void withMapVeil(next, apply);
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (update: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === "function") {
    running?.kill();
    teardownOverlay();
    doc.startViewTransition(apply);
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
  running.set(el, { autoAlpha: 0, force3D: true });
  running.to(el, { autoAlpha: 1, duration: 0.14, ease: "power2.in" });
  running.add(apply);
  running.to(el, { autoAlpha: 0, duration: 0.18, ease: "power2.out" });
}

export function spinThemeIcon(node: HTMLElement | null, toDark: boolean): void {
  if (!node || reducedMotion()) return;
  gsap.killTweensOf(node);
  gsap.fromTo(
    node,
    { rotate: toDark ? 40 : -40, scale: 0.82 },
    { rotate: 0, scale: 1, duration: 0.32, ease: "power3.out", overwrite: true, force3D: true }
  );
}
