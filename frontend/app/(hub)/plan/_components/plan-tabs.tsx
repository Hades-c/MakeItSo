"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { PlanTab } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { TAB_LABELS } from "../_lib/labels";
import { PLAN_TABS, planHref } from "../_lib/tabs";

/**
 * The /plan tabs as links (the tab lives in the URL: ?tab=next|four-year|suggestions|summer), so each view is
 * bookmarkable, works without JavaScript and is rendered on the server. The current one is aria-current="page".
 * A plain click opens the tab in a transition: until the server sends the new view, the tab being opened shows
 * a spinner and the view below is marked busy (only search params change, so no loading.tsx would show). Below
 * 640px the four tabs sit in a 2×2 grid, so none is off-screen.
 */
export function PlanTabs({ active, children }: { active: PlanTab; children?: React.ReactNode }) {
  const router = useRouter();
  const [pendingTab, setPendingTab] = React.useState<PlanTab | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const opening = isPending ? pendingTab : null;

  const open = (event: React.MouseEvent<HTMLAnchorElement>, tab: PlanTab) => {
    // Let the browser handle new-tab/window clicks; a plain click navigates in a transition.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (tab === active) return;
    event.preventDefault();
    setPendingTab(tab);
    startTransition(() => router.push(planHref(tab)));
  };

  return (
    <>
      <nav aria-label="Plan views" className="mb-5 print:hidden">
        <ul className="grid grid-cols-2 gap-x-1 border-b border-line sm:flex sm:flex-wrap">
          {PLAN_TABS.map((tab) => {
            const current = tab === active;
            const loading = opening === tab;
            return (
              <li key={tab}>
                <Link
                  href={planHref(tab)}
                  aria-current={current ? "page" : undefined}
                  aria-busy={loading || undefined}
                  onClick={(event) => open(event, tab)}
                  className={cn(
                    "-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none",
                    current
                      ? "border-primary text-primary"
                      : "border-transparent text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {TAB_LABELS[tab]}
                  {loading ? (
                    <>
                      <LoaderCircle
                        aria-hidden
                        className="size-3.5 animate-spin motion-reduce:animate-none"
                      />
                      <span className="sr-only">(loading)</span>
                    </>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div aria-live="polite" className="sr-only">
        {opening ? `Opening ${TAB_LABELS[opening]}…` : ""}
      </div>
      {children === undefined ? null : (
        <div
          aria-busy={opening ? true : undefined}
          data-testid="plan-tab-body"
          className={cn(
            "transition-opacity motion-reduce:transition-none",
            opening && "pointer-events-none opacity-60",
          )}
        >
          {children}
        </div>
      )}
    </>
  );
}
