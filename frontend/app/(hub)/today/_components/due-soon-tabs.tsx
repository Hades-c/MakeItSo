"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DueSoonTabsProps {
  /** Every row due for the student, pre-rendered by the server. */
  all: React.ReactNode;
  /** The same rows, pre-rendered again with only those tied to a course (PLAN-UX §4). */
  classes: React.ReactNode;
}

const TABS = [
  { key: "all", label: "All" },
  { key: "classes", label: "Classes" },
] as const;

/**
 * All/Classes above the Due for you list. Both views are rendered by the server and already in the page; the tab
 * only toggles which one is visible (the ShowMore pattern), so switching never fetches anything.
 */
export function DueSoonTabs({ all, classes }: DueSoonTabsProps) {
  const idBase = React.useId();
  const [view, setView] = React.useState<"all" | "classes">("all");
  const views = { all, classes };

  return (
    <div>
      <div role="tablist" aria-label="Due for you" className="mb-3 flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.key}`}
            aria-selected={view === tab.key}
            aria-controls={`${idBase}-panel-${tab.key}`}
            onClick={() => setView(tab.key)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              view === tab.key ? "bg-surface-2 text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${idBase}-panel-${tab.key}`}
          aria-labelledby={`${idBase}-tab-${tab.key}`}
          hidden={view !== tab.key}
        >
          {views[tab.key]}
        </div>
      ))}
    </div>
  );
}
