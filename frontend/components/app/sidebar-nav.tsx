"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  activeNavKey,
  ALL_NAV_KEYS,
  navParentOf,
  sidebarSections,
  type NavItem,
  type NavKey,
} from "./nav-items";

export interface NavCounts {
  /** Plan progress: credits done out of the credits required. */
  plan?: { done: number; total: number };
}

/**
 * My plan's "8/32". Only My plan has a count: a course count beside Courses, under "My plan 8/32", read as that
 * many courses in the plan. Screen readers get the words in one string ("My plan, 8 of 32 credits"): the
 * link is a flex box, where hidden pieces between visible ones lose their spaces.
 */
function CountLabel({ navKey, counts }: { navKey: NavKey; counts?: NavCounts }) {
  if (navKey === "plan" && counts?.plan) {
    const { done, total } = counts.plan;
    return (
      <span className="ml-auto text-xs text-fg-3 tabular-nums max-xl:hidden">
        <span aria-hidden>
          {done}/{total}
        </span>
        <span className="sr-only">{`, ${done} of ${total} credits`}</span>
      </span>
    );
  }
  return null;
}

export interface SidebarNavProps {
  counts?: NavCounts;
  /** The sections to show: `hubNavKeys(flags)` from the hub layout (default: all). */
  nav?: readonly NavKey[];
}

/**
 * How a link is marked. `current`: this page (aria-current, the tinted pill, red label, --nav-mark bar). `parent`:
 * the page is nested under this one (/syllabi under My plan): the --nav-mark bar beside it too, so the group reads
 * as the current one, but no aria-current (the child carries it). On the rail the children are hidden, so there the
 * parent takes the full current look in their place.
 */
type NavState = "current" | "parent" | "none";

const CURRENT_BAR =
  "relative before:absolute before:top-1/2 before:left-1 before:h-4.5 before:w-0.75 before:-translate-y-1/2 before:rounded-full before:bg-nav-mark max-xl:before:left-0.75 max-xl:before:h-5.5";

/** One link, top-level or nested (nested links show from 1180px only, indented: the rail has no room for them). */
function NavLink({
  item,
  state,
  counts,
  indent = false,
}: {
  item: NavItem;
  state: NavState;
  counts?: NavCounts;
  indent?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={state === "current" ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors xl:min-h-9.75",
        "max-xl:h-14 max-xl:w-full max-xl:flex-col max-xl:justify-center max-xl:gap-1 max-xl:px-0",
        indent && "xl:pl-7.5",
        // Current page: the tinted pill and red label, plus a 3 × 18px bar in --nav-mark inside the pill's
        // left edge (22px tall on the rail). The bar is the ≥ 3:1 cue: the tint alone is about 1.1:1.
        state === "current" && cn(CURRENT_BAR, "bg-primary-wash font-strong text-primary"),
        state === "parent" &&
          cn(
            CURRENT_BAR,
            "font-strong text-fg xl:hover:bg-surface-2",
            "max-xl:bg-primary-wash max-xl:text-primary",
          ),
        state === "none" && "font-nav text-fg-2 hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon aria-hidden strokeWidth={1.8} className="size-4.5 shrink-0" />
      <span className="max-xl:text-nav">{item.label}</span>
      <CountLabel navKey={item.key} counts={counts} />
    </Link>
  );
}

/**
 * Sidebar navigation (≥720px): the same five top-level sections as the phone's bottom tabs (Today, Courses, My
 * plan, Careers, Events). From 1180px a row per section, with Syllabi nested under My plan and Alumni under
 * Careers, indented and always shown; on a nested page the child is current and its parent carries the bar too.
 * Below 1180px, a rail of 80 × 56px items with the icon and a visible 13px label under it, like the bottom tabs:
 * just the five parents (a nested page highlights its parent; My plan and Careers link to Syllabi and Alumni in
 * their headers). Every label is on screen at every width: no tooltip (`title`) carries it (PLAN §7, no
 * hover-only content). Lists only the sections in `nav`.
 */
export function SidebarNav({ counts, nav = ALL_NAV_KEYS }: SidebarNavProps) {
  const pathname = usePathname();
  const active = activeNavKey(pathname, "sidebar", nav);
  const activeParent = active ? navParentOf(active) : null;
  const stateOf = (key: NavKey): NavState =>
    key === active ? "current" : key === activeParent ? "parent" : "none";
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-1">
        {sidebarSections(nav).map(({ item, children }) => (
          <li key={item.key}>
            <NavLink item={item} state={stateOf(item.key)} counts={counts} />
            {children.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1 max-xl:hidden">
                {children.map((child) => (
                  <li key={child.key}>
                    <NavLink item={child} state={stateOf(child.key)} counts={counts} indent />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
