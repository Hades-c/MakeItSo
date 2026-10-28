"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  activeNavKey,
  ALL_NAV_KEYS,
  isSidebarGroup,
  sidebarSections,
  type NavItem,
  type NavKey,
} from "./nav-items";

export interface NavCounts {
  /** Plan progress: credits done out of the credits required. */
  plan?: { done: number; total: number };
}

/**
 * My plan's "8/32". Only My plan has a count: a course count beside Courses, nested under "My plan 8/32", read as
 * that many courses in the plan. Screen readers get the words in one string ("My plan, 8 of 32 credits"): the
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

/** One link, top-level or nested under My plan (`indent` only matters from 1180px: the rail has no room for it). */
function NavLink({
  item,
  current,
  counts,
  indent = false,
}: {
  item: NavItem;
  current: boolean;
  counts?: NavCounts;
  indent?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors xl:min-h-9.75",
        "max-xl:h-14 max-xl:w-full max-xl:flex-col max-xl:justify-center max-xl:gap-1 max-xl:px-0",
        indent && "xl:pl-7.5",
        // Current page: the tinted pill and red label, plus a 3 × 18px bar in --nav-mark inside the pill's
        // left edge (22px tall on the rail). The bar is the ≥ 3:1 cue: the tint alone is about 1.1:1.
        current
          ? "relative bg-primary-wash font-strong text-primary before:absolute before:top-1/2 before:left-1 before:h-4.5 before:w-0.75 before:-translate-y-1/2 before:rounded-full before:bg-nav-mark max-xl:before:left-0.75 max-xl:before:h-5.5"
          : "font-nav text-fg-2 hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon aria-hidden strokeWidth={1.8} className="size-4.5 shrink-0" />
      <span className="max-xl:text-nav">{item.label}</span>
      <CountLabel navKey={item.key} counts={counts} />
    </Link>
  );
}

/**
 * Sidebar navigation (≥720px). A row per section from 1180px; below, a rail of 80 × 56px items with the icon and a
 * visible 13px label under it, like the phone's bottom tabs. Every label is on screen at every width: no tooltip
 * (`title`) carries it (PLAN §7, no hover-only content). Today and Events are top-level; My plan is a group
 * nesting Courses, Careers, Alumni and Syllabi (indented from 1180px; stacked like any other rail item below
 * that, since the rail has no room to show nesting). Lists only the sections in `nav`, in sidebar order.
 */
export function SidebarNav({ counts, nav = ALL_NAV_KEYS }: SidebarNavProps) {
  const pathname = usePathname();
  const active = activeNavKey(pathname, "sidebar", nav);
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-1">
        {sidebarSections(nav).map((entry) =>
          isSidebarGroup(entry) ? (
            <li key={entry.item.key}>
              <NavLink item={entry.item} current={entry.item.key === active} counts={counts} />
              {entry.children.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {entry.children.map((child) => (
                    <li key={child.key}>
                      <NavLink item={child} current={child.key === active} counts={counts} indent />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ) : (
            <li key={entry.key}>
              <NavLink item={entry} current={entry.key === active} counts={counts} />
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
