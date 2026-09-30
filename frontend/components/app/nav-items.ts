import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  House,
  Map as MapIcon,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavKey = "today" | "courses" | "plan" | "careers" | "events" | "alumni";

export interface NavItem {
  key: NavKey;
  href: string;
  /** Sidebar label. */
  label: string;
  /** Bottom-tab label (phones). */
  shortLabel: string;
  icon: LucideIcon;
}

/** The hub's information architecture (PLAN §3). One label per destination, everywhere. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "today", href: "/today", label: "Today", shortLabel: "Today", icon: House },
  { key: "courses", href: "/courses", label: "Courses", shortLabel: "Courses", icon: BookOpen },
  { key: "plan", href: "/plan", label: "My plan", shortLabel: "Plan", icon: MapIcon },
  {
    key: "careers",
    href: "/careers",
    label: "Careers",
    shortLabel: "Careers",
    icon: BriefcaseBusiness,
  },
  { key: "events", href: "/events", label: "Events", shortLabel: "Events", icon: CalendarDays },
  { key: "alumni", href: "/alumni", label: "Alumni", shortLabel: "Alumni", icon: Users },
];

/**
 * Every section, in sidebar order: the default for the shell's `nav` prop (the sections it shows). The hub layout
 * passes `hubNavKeys(flags)` (server/features.ts) instead, so a flagged-off Careers, Events or Alumni leaves the
 * sidebar, the bottom tabs and the command palette together.
 */
export const ALL_NAV_KEYS: readonly NavKey[] = NAV_ITEMS.map((item) => item.key);

/** Phones show five tabs; Alumni lives under Careers and Profile under the avatar menu. */
export const BOTTOM_TAB_KEYS: readonly NavKey[] = ["today", "courses", "plan", "careers", "events"];

/** Sidebar entries for the shown sections, in sidebar order. */
export function sidebarItems(nav: readonly NavKey[] = ALL_NAV_KEYS): NavItem[] {
  return NAV_ITEMS.filter((item) => nav.includes(item.key));
}

/** Phone tabs for the shown sections, in tab order: four when Careers or Events is off, three with neither. */
export function bottomTabItems(nav: readonly NavKey[] = ALL_NAV_KEYS): NavItem[] {
  return NAV_ITEMS.filter((item) => BOTTOM_TAB_KEYS.includes(item.key) && nav.includes(item.key));
}

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The section a path belongs to, shown or not: "/careers/law" → careers, "/profile" → null. */
export function navSectionOf(pathname: string): NavKey | null {
  return NAV_ITEMS.find((item) => matches(pathname, item.href))?.key ?? null;
}

/**
 * Which nav entry is current for a path, among the shown sections (`nav`, default all). On the tab bar, /alumni
 * highlights Careers. A hidden section is never current (its pages answer 404, see requireFeature): with Alumni
 * hidden nothing is highlighted on /alumni, and with Careers hidden /alumni highlights no tab.
 */
export function activeNavKey(
  pathname: string,
  surface: "sidebar" | "tabs",
  nav: readonly NavKey[] = ALL_NAV_KEYS,
): NavKey | null {
  const section = navSectionOf(pathname);
  if (!section || !nav.includes(section)) return null;
  if (surface === "tabs" && section === "alumni") return nav.includes("careers") ? "careers" : null;
  return section;
}
