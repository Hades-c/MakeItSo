import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  House,
  Map as MapIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ALL_NAV_KEYS, type NavKey } from "@/lib/nav";

export { ALL_NAV_KEYS, type NavKey };

export interface NavItem {
  key: NavKey;
  href: string;
  /** Sidebar label. */
  label: string;
  /** Bottom-tab label (phones). */
  shortLabel: string;
  icon: LucideIcon;
}

const NAV_ITEM_DETAILS: Record<NavKey, Omit<NavItem, "key">> = {
  today: { href: "/today", label: "Today", shortLabel: "Today", icon: House },
  courses: { href: "/courses", label: "Courses", shortLabel: "Courses", icon: BookOpen },
  plan: { href: "/plan", label: "My plan", shortLabel: "Plan", icon: MapIcon },
  careers: { href: "/careers", label: "Careers", shortLabel: "Careers", icon: BriefcaseBusiness },
  events: { href: "/events", label: "Events", shortLabel: "Events", icon: CalendarDays },
  alumni: { href: "/alumni", label: "Alumni", shortLabel: "Alumni", icon: Users },
  syllabi: { href: "/syllabi", label: "Syllabi", shortLabel: "Syllabi", icon: FileText },
};

/**
 * The hub's information architecture (PLAN §3). One label per destination, everywhere. In the order of
 * ALL_NAV_KEYS (lib/nav.ts), which is also the default for the shell's `nav` prop (the sections it shows). The hub
 * layout passes `hubNavKeys(flags)` (server/features.ts) instead, so a flagged-off Careers, Events or Alumni leaves
 * the sidebar, the bottom tabs and the command palette together.
 */
export const NAV_ITEMS: readonly NavItem[] = ALL_NAV_KEYS.map((key) => ({
  key,
  ...NAV_ITEM_DETAILS[key],
}));

/**
 * The five top-level sections, in order: the phone tabs and the sidebar's (and the rail's) parents are the same
 * five. Syllabi is nested under My plan, Alumni under Careers; Profile lives under the avatar menu.
 */
export const BOTTOM_TAB_KEYS: readonly NavKey[] = ["today", "courses", "plan", "careers", "events"];

/** The sections nested under a top-level one, in the order they are listed under it. */
const NAV_CHILDREN: Partial<Record<NavKey, readonly NavKey[]>> = {
  plan: ["syllabi"],
  careers: ["alumni"],
};

/** The top-level section a nested one sits under: syllabi → plan, alumni → careers; null for a top-level one. */
export function navParentOf(key: NavKey): NavKey | null {
  for (const parent of BOTTOM_TAB_KEYS) {
    if (NAV_CHILDREN[parent]?.includes(key)) return parent;
  }
  return null;
}

/** Entries for the shown sections, in sidebar reading order (the command palette's Pages list). */
export function sidebarItems(nav: readonly NavKey[] = ALL_NAV_KEYS): NavItem[] {
  return NAV_ITEMS.filter((item) => nav.includes(item.key));
}

/** Phone tabs for the shown sections, in tab order: four when Careers or Events is off, three with neither. */
export function bottomTabItems(nav: readonly NavKey[] = ALL_NAV_KEYS): NavItem[] {
  return NAV_ITEMS.filter((item) => BOTTOM_TAB_KEYS.includes(item.key) && nav.includes(item.key));
}

/** A top-level sidebar entry and the shown sections nested under it (often none). */
export interface SidebarSection {
  item: NavItem;
  children: readonly NavItem[];
}

/**
 * The sidebar's shape: the five top-level sections the phone tabs show, each with its nested children (Syllabi
 * under My plan, Alumni under Careers). Filtered to the shown sections like `sidebarItems`. A hidden parent takes
 * its children with it; the flags never show a child without its parent (Alumni needs Careers, see
 * featureEnabled; My plan is always there).
 */
export function sidebarSections(nav: readonly NavKey[] = ALL_NAV_KEYS): SidebarSection[] {
  const shown = new Map(sidebarItems(nav).map((item) => [item.key, item]));
  return BOTTOM_TAB_KEYS.flatMap((key) => {
    const item = shown.get(key);
    if (!item) return [];
    const children = (NAV_CHILDREN[key] ?? [])
      .map((child) => shown.get(child))
      .filter((child): child is NavItem => child !== undefined);
    return [{ item, children }];
  });
}

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The section a path belongs to, shown or not: "/careers/law" → careers, "/profile" → null. */
export function navSectionOf(pathname: string): NavKey | null {
  return NAV_ITEMS.find((item) => matches(pathname, item.href))?.key ?? null;
}

/**
 * Which nav entry is current for a path, among the shown sections (`nav`, default all). The sidebar marks the
 * section itself (/syllabi → syllabi; SidebarNav marks its parent via navParentOf too); the tab bar has only the
 * five top-level sections, so a nested page highlights its parent's tab (/syllabi → plan, /alumni → careers). A
 * hidden section is never current (its pages answer 404, see requireFeature): with Alumni hidden nothing is
 * highlighted on /alumni, and with Careers hidden /alumni highlights no tab.
 */
export function activeNavKey(
  pathname: string,
  surface: "sidebar" | "tabs",
  nav: readonly NavKey[] = ALL_NAV_KEYS,
): NavKey | null {
  const section = navSectionOf(pathname);
  if (!section || !nav.includes(section)) return null;
  if (surface === "sidebar") return section;
  const parent = navParentOf(section);
  if (!parent) return section;
  return nav.includes(parent) ? parent : null;
}
