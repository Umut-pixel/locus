/** Icon rail + label column — inner shell is always expanded; outer clips. */
export const ICON_RAIL_WIDTH = 52;
export const SIDEBAR_EXPANDED_WIDTH = 248;

/** Yumuşak expo-out — hızlı start yok, göz yormayan kapanış. */
export const SIDEBAR_EASE = [0.16, 1, 0.3, 1] as const;

export function sidebarTween(expanded: boolean) {
  return {
    duration: expanded ? 0.44 : 0.38,
    ease: SIDEBAR_EASE,
  };
}

export const SIDEBAR_WIDTH_TRANSITION = {
  duration: 0.4,
  ease: SIDEBAR_EASE,
};

/** Dikey kaydırma (subpage / bölüm başlığı) genişlikle aynı ritim. */
export const SIDEBAR_REVEAL_TRANSITION = SIDEBAR_WIDTH_TRANSITION;

/** Kapalı rayda seçim hapı — ikon etrafında, tam satır değil. */
export const RAIL_PILL_SIZE = 32;
export const RAIL_PILL_INSET = (ICON_RAIL_WIDTH - RAIL_PILL_SIZE) / 2;

export const SIDEBAR_ROW =
  "grid w-full grid-cols-[var(--sidebar-rail)_minmax(0,1fr)] items-center";
