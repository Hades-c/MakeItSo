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

/** My plan's nested children, in the order they are nested under it. */
const PLAN_GROUP_CHILDREN: readonly NavKey[] = ["courses", "careers", "alumni", "syllabi"];

/** A sidebar group: My plan's own link, plus the sections nested under it (never empty: Courses is always shown). */
export interface SidebarGroup {
  item: NavItem;
  children: readonly NavItem[];
}

export type SidebarEntry = NavItem | SidebarGroup;

/** True for a sidebar group, as opposed to a plain top-level item (neither NavItem shape has `children`). */
export function isSidebarGroup(entry: SidebarEntry): entry is SidebarGroup {
  return "children" in entry;
}

/**
 * The sidebar's shape (PLAN-UX §2): Today and Events stay top-level links; My plan becomes a group, its own link
 * still /plan, nesting Courses, Careers, Alumni and Syllabi under it. Filtered to the shown sections like
 * `sidebarItems`, in sidebar order; a hidden section is left out of the group's children the same way it would be
 * dropped from a flat list.
 */
export function sidebarSections(nav: readonly NavKey[] = ALL_NAV_KEYS): SidebarEntry[] {
  const shown = new Map(sidebarItems(nav).map((item) => [item.key, item]));
  const entries: SidebarEntry[] = [];
  const today = shown.get("today");
  if (today) entries.push(today);
  const plan = shown.get("plan");
  if (plan) {
    const children = PLAN_GROUP_CHILDREN.map((key) => shown.get(key)).filter(
      (item): item is NavItem => item !== undefined,
    );
    entries.push({ item: plan, children });
  }
  const events = shown.get("events");
  if (events) entries.push(events);
  return entries;
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
 * highlights Careers and /syllabi My plan (neither has a tab). A hidden section is never current (its pages answer
 * 404, see requireFeature): with Alumni hidden nothing is highlighted on /alumni, and with Careers hidden /alumni
 * highlights no tab.
 */
export function activeNavKey(
  pathname: string,
  surface: "sidebar" | "tabs",
  nav: readonly NavKey[] = ALL_NAV_KEYS,
): NavKey | null {
  const section = navSectionOf(pathname);
  if (!section || !nav.includes(section)) return null;
  if (surface === "tabs" && section === "alumni") return nav.includes("careers") ? "careers" : null;
  // Syllabi has no phone tab: it belongs to My plan (it is nested under it in the sidebar).
  if (surface === "tabs" && section === "syllabi") return nav.includes("plan") ? "plan" : null;
  return section;
}
