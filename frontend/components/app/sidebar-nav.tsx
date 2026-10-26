"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavKey, ALL_NAV_KEYS, sidebarItems, type NavKey } from "./nav-items";

export interface NavCounts {
  /** Courses in the catalog for the selected term. */
  courses?: number;
  /** Plan progress: done (or planned) out of required courses/credits. */
  plan?: { done: number; total: number };
}

function CountLabel({ navKey, counts }: { navKey: NavKey; counts?: NavCounts }) {
  if (navKey === "courses" && counts?.courses !== undefined) {
    return (
      <span className="ml-auto text-xs text-fg-3 tabular-nums max-xl:hidden">
        <span className="sr-only">, </span>
        {counts.courses.toLocaleString("en-US")}
        <span className="sr-only"> courses</span>
      </span>
    );
  }
  if (navKey === "plan" && counts?.plan) {
    return (
      <span className="ml-auto text-xs text-fg-3 tabular-nums max-xl:hidden">
        <span className="sr-only">, </span>
        {counts.plan.done}
        <span aria-hidden>/</span>
        <span className="sr-only"> of </span>
        {counts.plan.total}
        <span className="sr-only"> credits</span>
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
 * Sidebar navigation (≥720px). A row per section from 1180px; below, a rail of 80 × 56px items with the icon and a
 * visible 13px label under it, like the phone's bottom tabs. Every label is on screen at every width: no tooltip
 * (`title`) carries it (PLAN §7, no hover-only content). Lists only the sections in `nav`, in sidebar order.
 */
export function SidebarNav({ counts, nav = ALL_NAV_KEYS }: SidebarNavProps) {
  const pathname = usePathname();
  const active = activeNavKey(pathname, "sidebar", nav);
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-1">
        {sidebarItems(nav).map(({ key, href, label, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors xl:min-h-9.75",
                  "max-xl:h-14 max-xl:w-full max-xl:flex-col max-xl:justify-center max-xl:gap-1 max-xl:px-0",
                  // Current page: the tinted pill and red label, plus a 3 × 18px bar in --nav-mark inside the pill's
                  // left edge (22px tall on the rail). The bar is the ≥ 3:1 cue: the tint alone is about 1.1:1.
                  current
                    ? "relative bg-primary-wash font-strong text-primary before:absolute before:top-1/2 before:left-1 before:h-4.5 before:w-0.75 before:-translate-y-1/2 before:rounded-full before:bg-nav-mark max-xl:before:left-0.75 max-xl:before:h-5.5"
                    : "font-nav text-fg-2 hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon aria-hidden strokeWidth={1.8} className="size-4.5 shrink-0" />
                <span className="max-xl:text-nav">{label}</span>
                <CountLabel navKey={key} counts={counts} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
