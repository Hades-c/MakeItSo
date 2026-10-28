"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type View = "all" | "classes";

export interface DueSoonTabsProps {
  /** Every row due for the student, pre-rendered by the server. */
  all: React.ReactNode;
  /** The same rows, pre-rendered again with only those tied to a course (PLAN-UX §4). */
  classes: React.ReactNode;
  /** How many rows of each view are for the student: the tab says it, so the number follows the view. */
  counts: Readonly<Record<View, number>>;
}

const TABS: readonly { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "classes", label: "Coursework" },
];

/**
 * All/Coursework above the Due for you list: real tabs (arrow keys, Home and End move between them, PLAN §7
 * keyboard), 44px tall. Both views are rendered by the server and already in the page; a tab only toggles which
 * one is visible (the ShowMore pattern), so switching never fetches anything. The selected tab is red text on the
 * red wash (selection, docs/CONTRACTS.md "Look") and bold, never colour alone.
 */
export function DueSoonTabs({ all, classes, counts }: DueSoonTabsProps) {
  const idBase = React.useId();
  const [view, setView] = React.useState<View>("all");
  const refs = React.useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const views = { all, classes };

  function onKeyDown(event: React.KeyboardEvent) {
    const index = TABS.findIndex((tab) => tab.key === view);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const key = TABS[next]!.key;
    setView(key);
    refs.current[key]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Due for you"
        className="mb-3 flex gap-1"
        onKeyDown={onKeyDown}
      >
        {TABS.map((tab) => {
          const selected = view === tab.key;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                refs.current[tab.key] = el;
              }}
              type="button"
              role="tab"
              id={`${idBase}-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`${idBase}-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setView(tab.key)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-3.5 text-sm transition-colors",
                selected
                  ? "bg-primary-wash font-semibold text-primary"
                  : "font-medium text-fg-2 hover:bg-surface-2 hover:text-fg",
              )}
            >
              {/* One inline run of text, so the name reads "All 2 for you" (a flex box drops the spaces). */}
              <span>
                {tab.label}{" "}
                <span className={cn("text-xs", selected ? "text-primary" : "text-fg-3")}>
                  {counts[tab.key]}
                </span>{" "}
                <span className="sr-only">for you</span>
              </span>
            </button>
          );
        })}
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
