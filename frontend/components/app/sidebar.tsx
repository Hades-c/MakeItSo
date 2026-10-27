import { cn } from "@/lib/utils";
import type { NavKey } from "./nav-items";
import { SidebarNav, type NavCounts } from "./sidebar-nav";

export interface SidebarProps {
  counts?: NavCounts;
  /** The sections to show (default: all). */
  nav?: readonly NavKey[];
  className?: string;
}

/** 240px sidebar from 1180px, a 96px rail (icons with their labels) from 720px, hidden on phones (bottom tabs instead). */
export function Sidebar({ counts, nav, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "sticky top-16 hidden h-[calc(100dvh-4rem)] flex-col gap-1 overflow-y-auto border-r border-line px-2 py-5 md:flex xl:px-4",
        className,
      )}
    >
      <SidebarNav counts={counts} nav={nav} />
    </aside>
  );
}
