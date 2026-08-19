/** Icon rail + label column — inner shell is always expanded; outer clips. */
export const ICON_RAIL_WIDTH = 52;
export const SIDEBAR_EXPANDED_WIDTH = 248;

export const SIDEBAR_WIDTH_TRANSITION = {
  duration: 0.2,
  ease: [0.32, 0.72, 0, 1] as const,
};

export const SIDEBAR_ROW =
  "grid w-full grid-cols-[var(--sidebar-rail)_minmax(0,1fr)] items-center";
