"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "locus-theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Light mode şimdilik kapalı — her zaman koyu tema.
  const [theme] = useState<Theme>("dark");

  useEffect(() => {
    applyTheme("dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    } catch {
      // localStorage erişilemez (gizli mod / devre dışı)
    }
  }, []);

  const toggleTheme = useCallback(() => {
    // Light mode geri gelene kadar no-op.
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
