/**
 * The hub's sections (PLAN §3), in sidebar reading order, each nested section right after its parent (Syllabi after
 * My plan, Alumni after Careers): the one list the shell (components/app/nav-items.ts adds labels, hrefs, icons and
 * the nesting) and the server (server/features.ts decides which flagged sections are shown) share. Isomorphic and
 * UI-free, so server code never loads a component module to know the sections.
 */
export const ALL_NAV_KEYS = [
  "today",
  "courses",
  "plan",
  "syllabi",
  "careers",
  "alumni",
  "events",
] as const;

export type NavKey = (typeof ALL_NAV_KEYS)[number];
