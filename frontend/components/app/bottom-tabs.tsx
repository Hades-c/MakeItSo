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
 * Events when they are shown, in equal columns (five, four or three tabs).
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
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-semibold transition-colors",
                  current ? "text-primary" : "text-fg-3 hover:text-fg",
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
