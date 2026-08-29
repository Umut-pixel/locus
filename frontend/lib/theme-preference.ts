export type ThemeName = "light" | "dark";

export const THEME_STORAGE_KEY = "locus-theme";

export function parseTheme(raw: string | null | undefined): ThemeName {
  return raw === "light" ? "light" : "dark";
}

/** Cookie yoksa bilinmiyor — SSR .dark ve color-scheme basma (FOUC kaynağı). */
export function readThemeCookie(raw: string | null | undefined): ThemeName | undefined {
  return raw === "light" || raw === "dark" ? raw : undefined;
}

/** First paint: html background + color-scheme before the CSS bundle. */
export const THEME_CRITICAL_CSS =
  "html{background:#f7f7f7;color-scheme:light}html.dark{background:oklch(0.1776 0 0);color-scheme:dark}";

/**
 * Runs in <head> before paint. Aligns class with localStorage and writes a
 * cookie so the next SSR html already has the right .dark / color-scheme.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY
)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="dark";var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.setAttribute("data-theme",t);r.style.colorScheme=t;document.cookie=k+"="+t+"; path=/; max-age=31536000; SameSite=Lax";}catch(e){document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-theme","dark");}})();`;
