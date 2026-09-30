/**
 * Theme preference. "system" (the default) follows prefers-color-scheme; "light" and "dark" are explicit choices
 * stored in localStorage and applied as <html data-theme="…">. app/globals.css reads the attribute.
 */

export const THEME_STORAGE_KEY = "mis-theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export function isExplicitTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

/**
 * Inline <head> script that applies a stored explicit theme before first paint (no flash of the wrong theme).
 * Kept tiny and dependency-free; it runs before React. The CSP allows inline scripts.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
