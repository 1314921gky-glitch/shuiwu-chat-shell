import type { ThemePref } from "./types";

export const THEME_STORAGE_KEY = "shuiwu-theme";

export function parseTheme(raw: unknown): ThemePref {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(pref: ThemePref) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = pref;
}

export function cacheTheme(pref: ThemePref) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, pref);
}

export function readCachedTheme(): ThemePref {
  if (typeof localStorage === "undefined") return "system";
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function applyCachedTheme() {
  applyTheme(readCachedTheme());
}

export function nextTheme(pref: ThemePref): ThemePref {
  if (pref === "system") return "light";
  if (pref === "light") return "dark";
  return "system";
}

export function themeLabel(pref: ThemePref): string {
  if (pref === "light") return "浅色";
  if (pref === "dark") return "深色";
  return "跟随系统";
}
