"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavKey, ALL_NAV_KEYS, bottomTabItems, type NavKey } from "./nav-items";

export interface BottomTabsProps {
  /** The sections to show: `hubNavKeys(flags)` from the hub layout (default: all). */
  nav?: readonly NavKey[];
  className?: string;
}

/**
 * Phone navigation (<720px): the only thing fixed to the bottom of the screen. Reserves the home-indicator area
 * (safe-area inset); the shell adds matching bottom padding to <main>. Today, Courses and Plan, then Careers and
 * Events when they are shown, in equal columns (five, four or three tabs): the sidebar's five top-level sections.
 * A nested page highlights its parent's tab (/syllabi → Plan, /alumni → Careers).
 */
export function BottomTabs({ nav = ALL_NAV_KEYS, className }: BottomTabsProps) {
  const pathname = usePathname();
  const active = activeNavKey(pathname, "tabs", nav);
  return (
    <nav
      aria-label="Main"
      data-testid="bottom-tabs"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-1 pt-1.5 pb-safe md:hidden",
        className,
      )}
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {bottomTabItems(nav).map(({ key, href, shortLabel, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-semibold transition-colors",
                  // Current page: the red label plus a 28 × 3px bar in --nav-mark on the bar's top edge (the ≥ 3:1 cue).
                  current
                    ? "text-primary before:absolute before:-top-1.5 before:left-1/2 before:h-0.75 before:w-7 before:-translate-x-1/2 before:rounded-b-[3px] before:bg-nav-mark"
                    : "text-fg-3 hover:text-fg",
                )}
              >
                <Icon aria-hidden strokeWidth={1.8} className="size-5.5" />
                {shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
