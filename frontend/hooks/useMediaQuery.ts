"use client";

import { useEffect, useState } from "react";

/** SSR-safe matchMedia; ilk paint'te false, hydrate sonrası gerçek değer. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** lg breakpoint altı — sidebar yerine sheet, bottom dock paneller. */
export function useIsMobileLayout(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
