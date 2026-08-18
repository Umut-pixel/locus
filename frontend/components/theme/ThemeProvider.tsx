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
  const [theme, setTheme] = useState<Theme>("light");

  // DOM class'ına değil doğrudan localStorage'a bakar: React hydration,
  // blocking script'in hydration öncesi uyguladığı .dark class'ını kendi
  // (temasız) server değeriyle değiştirebiliyor — DOM'dan okumak o anda
  // zaten bozulmuş olan class'ı "doğru" sanıp onaylamış olurdu.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // localStorage erişilemez (gizli mod / devre dışı) — light varsayılan kalır.
    }
    setTheme(stored === "dark" ? "dark" : "light");
  }, []);

  // theme state'i her değiştiğinde DOM'u senkron tutar — hydration'ın class'ı
  // geri aldığı durumda da bu effect (yukarıdakinin tetiklediği state
  // güncellemesiyle) doğru değeri zorla uygular.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
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
