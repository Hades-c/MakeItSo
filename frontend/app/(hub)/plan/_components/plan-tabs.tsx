import Link from "next/link";
import type { PlanTab } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { TAB_LABELS } from "../_lib/labels";
import { PLAN_TABS, planHref } from "../_lib/tabs";

/**
 * The /plan tabs as links (the tab lives in the URL: ?tab=next|four-year|suggestions|summer), so each view is
 * bookmarkable, works without JavaScript and is rendered on the server. The current one is aria-current="page".
 * On phones the row scrolls sideways instead of shrinking its 14px labels.
 */
export function PlanTabs({ active }: { active: PlanTab }) {
  return (
    <nav
      aria-label="Plan views"
      className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0 print:hidden"
    >
      <ul className="flex min-w-max gap-1 border-b border-line">
        {PLAN_TABS.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                href={planHref(tab)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                  current
                    ? "border-primary text-primary"
                    : "border-transparent text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
