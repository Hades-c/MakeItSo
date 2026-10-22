import type * as React from "react";
import { BottomTabs } from "./bottom-tabs";
import type { NavKey } from "./nav-items";
import { Sidebar } from "./sidebar";
import type { NavCounts } from "./sidebar-nav";
import type { SourceLink, SourceSync } from "./sources-panel";
import { TopBar } from "./top-bar";

export interface AppShellProps {
  user: { name: string; email: string };
  /** Sidebar counts; omit any that are not known (no hardcoded numbers). */
  counts?: NavCounts;
  /**
   * The hub sections to show in the sidebar, the bottom tabs and the command palette (default: all). The hub layout
   * passes `hubNavKeys(flags)`, which leaves out Careers, Events and Alumni when their feature flags are off.
   */
  nav?: readonly NavKey[];
  /**
   * Sources panel: synced feeds with their real last-sync time and curated content with its verified date. List
   * only sources that are actually synced or verified.
   */
  sources?: readonly SourceSync[];
  /** Platforms MakeItSo only links to (shown under "Links"). */
  links?: readonly SourceLink[];
  /** "Now" for relative labels, computed once per request on the server. */
  now: Date;
  /** IANA zone for every time shown (APP_TIMEZONE). */
  timeZone?: string;
  children: React.ReactNode;
}

/**
 * Lakeside app shell for every signed-in page: top bar, sidebar (≥720px) or bottom tabs (<720px), and the main
 * column. Server component; the interactive parts (search, menus, active nav) are small client islands.
 * app/(hub)/layout.tsx passes real data in.
 */
export function AppShell({
  user,
  counts,
  nav,
  sources = [],
  links,
  now,
  timeZone,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary-fill px-4 py-2 text-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <TopBar user={user} nav={nav} />
      <div className="md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]">
        <Sidebar
          counts={counts}
          nav={nav}
          sources={sources}
          links={links}
          now={now}
          timeZone={timeZone}
        />
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 px-4 pt-4 pb-28 outline-none md:px-8 md:pt-6.5 md:pb-12"
        >
          <div className="max-w-300">{children}</div>
        </main>
      </div>
      <BottomTabs nav={nav} />
    </div>
  );
}
