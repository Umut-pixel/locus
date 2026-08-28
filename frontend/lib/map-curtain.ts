import gsap from "gsap";
import type { Map as MapboxMap } from "mapbox-gl";

type Theme = "light" | "dark";

const LIGHT_BG = "#f7f7f7";
const DARK_BG = "oklch(0.1776 0 0)";
const COVER_MS = 0.14;
const REVEAL_MS = 0.26;
const IDLE_CAP_MS = 2400;

const maps = new Set<MapboxMap>();

let veil: HTMLDivElement | null = null;
let tween: gsap.core.Timeline | null = null;
let inFlight = false;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function registerLiveMap(map: MapboxMap): () => void {
  maps.add(map);
  return () => {
    maps.delete(map);
  };
}

export function veilFill(theme: Theme): string {
  return theme === "dark" ? DARK_BG : LIGHT_BG;
}

function ensureVeil(): HTMLDivElement {
  if (veil?.isConnected) return veil;
  veil = document.createElement("div");
  veil.className = "locus-map-veil";
  veil.setAttribute("aria-hidden", "true");
  document.body.appendChild(veil);
  gsap.set(veil, { autoAlpha: 0 });
  return veil;
}

function cover(bg: string): Promise<void> {
  const el = ensureVeil();
  el.style.background = bg;
  el.style.pointerEvents = "auto";
  tween?.kill();
  if (reducedMotion()) {
    gsap.set(el, { autoAlpha: 1, force3D: true });
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    tween = gsap.timeline({ onComplete: resolve });
    tween.set(el, { force3D: true, willChange: "opacity" });
    tween.to(el, {
      autoAlpha: 1,
      duration: COVER_MS,
      ease: "power2.in",
      overwrite: true,
    });
  });
}

function uncover(): Promise<void> {
  if (!veil) return Promise.resolve();
  const el = veil;
  tween?.kill();
  if (reducedMotion()) {
    gsap.set(el, { autoAlpha: 0 });
    el.style.pointerEvents = "none";
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    tween = gsap.timeline({
      onComplete: () => {
        el.style.pointerEvents = "none";
        el.style.willChange = "auto";
        resolve();
      },
    });
    tween.to(el, {
      autoAlpha: 0,
      duration: REVEAL_MS,
      ease: "power2.out",
      overwrite: true,
    });
  });
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function whenMapsIdle(timeoutMs = IDLE_CAP_MS): Promise<void> {
  const list = [...maps];
  if (list.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let left = list.length;
    const timer = window.setTimeout(finish, timeoutMs);
    function finish() {
      window.clearTimeout(timer);
      resolve();
    }
    for (const map of list) {
      try {
        map.once("idle", () => {
          left -= 1;
          if (left <= 0) finish();
        });
      } catch {
        left -= 1;
        if (left <= 0) finish();
      }
    }
  });
}

/** Sahne perdesi — ilk tile idle olunca compositor'da solar. */
export function revealStageVeil(el: HTMLElement | null): void {
  if (!el) return;
  gsap.killTweensOf(el);
  if (reducedMotion()) {
    gsap.set(el, { autoAlpha: 0 });
    return;
  }
  gsap.to(el, {
    autoAlpha: 0,
    duration: REVEAL_MS,
    ease: "power2.out",
    overwrite: true,
    force3D: true,
  });
}

/**
 * Perde in → commit (tema / stil) → haritalar idle → perde kalk.
 * Yalnız opacity + translateZ; layout yok.
 */
export async function withMapVeil(
  nextTheme: Theme,
  commit: () => void
): Promise<void> {
  if (inFlight) {
    commit();
    return;
  }
  inFlight = true;
  try {
    await cover(veilFill(nextTheme));
    commit();
    await nextPaint();
    await new Promise<void>((r) => window.setTimeout(r, 64));
    let busy = false;
    for (const map of maps) {
      try {
        if (!map.loaded()) busy = true;
      } catch {
        /* kaldırılmış */
      }
    }
    if (busy) await whenMapsIdle();
  } finally {
    await uncover();
    inFlight = false;
  }
}

export function hasLiveMapCanvas(): boolean {
  return maps.size > 0 || Boolean(document.querySelector(".mapboxgl-canvas"));
}
