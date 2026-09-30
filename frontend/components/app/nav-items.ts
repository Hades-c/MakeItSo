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

/** Phones show five tabs; Alumni lives under Careers and Profile under the avatar menu. */
export const BOTTOM_TAB_KEYS: readonly NavKey[] = ["today", "courses", "plan", "careers", "events"];

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Which nav entry is current for a path. On the tab bar, /alumni highlights Careers. */
export function activeNavKey(pathname: string, surface: "sidebar" | "tabs"): NavKey | null {
  const item = NAV_ITEMS.find((i) => matches(pathname, i.href));
  if (!item) return null;
  if (surface === "tabs" && item.key === "alumni") return "careers";
  return item.key;
}
