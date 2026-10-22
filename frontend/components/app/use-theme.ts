"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  isExplicitTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  const attr = document.documentElement.getAttribute("data-theme");
  return isExplicitTheme(attr) ? attr : "system";
}

function readResolved(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Another tab changed the preference: apply it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyPreference(isExplicitTheme(event.newValue) ? event.newValue : "system", false);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

function applyPreference(preference: ThemePreference, persist: boolean) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  if (!persist) return;
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice still applies to this page.
  }
}

// The snapshot is a string so React can compare it cheaply.
const getSnapshot = () => {
  const preference = readPreference();
  return `${preference}:${readResolved(preference)}`;
};
const getServerSnapshot = () => "system:light";

/**
 * Theme preference shared by the toggle and the avatar menu. The inline script in app/layout.tsx applies a stored
 * choice before first paint; this hook keeps React in sync with <html data-theme>.
 */
export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, resolved] = snapshot.split(":") as [ThemePreference, ResolvedTheme];
  const setPreference = useCallback((next: ThemePreference) => applyPreference(next, true), []);
  return { preference, resolved, setPreference };
}
