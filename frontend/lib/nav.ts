/**
 * The hub's sections (PLAN §3), in sidebar order: the one list the shell (components/app/nav-items.ts adds labels,
 * hrefs and icons) and the server (server/features.ts decides which flagged sections are shown) share. Isomorphic
 * and UI-free, so server code never loads a component module to know the sections.
 */
export const ALL_NAV_KEYS = ["today", "courses", "plan", "careers", "events", "alumni"] as const;

export type NavKey = (typeof ALL_NAV_KEYS)[number];
