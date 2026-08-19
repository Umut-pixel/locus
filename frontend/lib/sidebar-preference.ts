"use client";

import { useCallback, useLayoutEffect, useState } from "react";

/** Eski "locus-sidebar-expanded" anahtarı korunur: "1" = pin. */
export const PINNED_STORAGE_KEY = "locus-sidebar-expanded";
export const COLLAPSED_SECTIONS_KEY = "locus-nav-collapsed";

export function usePinnedPreference(): [boolean, (next: boolean) => void, boolean] {
  const [pinned, setPinnedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    setPinnedState(window.localStorage.getItem(PINNED_STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  const setPinned = useCallback((next: boolean) => {
    setPinnedState(next);
    window.localStorage.setItem(PINNED_STORAGE_KEY, next ? "1" : "0");
  }, []);

  return [pinned, setPinned, hydrated];
}

export function useCollapsedSections(
  defaults: Record<string, boolean>
): [Record<string, boolean>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(defaults);

  useLayoutEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_SECTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") {
        setCollapsed((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // bozuk kayıt — varsayılanlar
    }
  }, []);

  const toggleSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      window.localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return [collapsed, toggleSection];
}
