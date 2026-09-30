import { cn } from "@/lib/utils";
import { SidebarNav, type NavCounts } from "./sidebar-nav";
import { SourcesPanel, type SourceSync } from "./sources-panel";

export interface SidebarProps {
  counts?: NavCounts;
  sources: readonly SourceSync[];
  now: Date;
  timeZone?: string;
  className?: string;
}

/** 240px sidebar from 1180px, a 72px icon rail from 720px, hidden on phones (bottom tabs instead). */
export function Sidebar({ counts, sources, now, timeZone, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "sticky top-16 hidden h-[calc(100dvh-4rem)] flex-col gap-1 overflow-y-auto border-r border-line px-3 py-5 md:flex xl:px-4",
        className,
      )}
    >
      <SidebarNav counts={counts} />
      <SourcesPanel
        sources={sources}
        now={now}
        timeZone={timeZone}
        className="mt-5.5 max-xl:hidden"
      />
    </aside>
  );
}
