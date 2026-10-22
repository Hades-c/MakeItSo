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
      <span className="ml-auto font-mono text-xs text-fg-3 max-xl:hidden">
        <span className="sr-only">, </span>
        {counts.courses.toLocaleString("en-US")}
        <span className="sr-only"> courses</span>
      </span>
    );
  }
  if (navKey === "plan" && counts?.plan) {
    return (
      <span className="ml-auto font-mono text-xs text-fg-3 max-xl:hidden">
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
 * Sidebar navigation (≥720px). Full labels from 1180px, an icon rail with visually hidden labels below. Lists only
 * the sections in `nav`, in sidebar order.
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
                title={label}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors xl:min-h-9.75",
                  "max-xl:justify-center max-xl:px-0",
                  current
                    ? "bg-primary-wash font-strong text-primary"
                    : "font-nav text-fg-2 hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon aria-hidden strokeWidth={1.8} className="size-4.5 shrink-0" />
                <span className="max-xl:sr-only">{label}</span>
                <CountLabel navKey={key} counts={counts} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
