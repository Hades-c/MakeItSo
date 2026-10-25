"use client";

import dynamic from "next/dynamic";
import type { PlanTab } from "@/lib/routes";

/**
 * The client islands of the 4-year, Suggestions and Summer views and of the print view, loaded on demand. Next
 * semester is /plan's default view, so its islands ship with the page; these others are only needed when their
 * view is open. The views' server components import them from here, not from their own modules: next/dynamic in
 * a client module puts each in a chunk of its own (a server-side next/dynamic would still list them in the page's
 * first load). They are still rendered on the server, and the HTML preloads the chunks of the islands it shows,
 * so a view opened directly hydrates as before. PlanTabs preloads a view's chunks when its tab is pointed at,
 * focused or touched, so switching tabs does not wait for them; until they arrive the tab shows as opening.
 */

export const ManualEntryForm = dynamic(() =>
  import("./manual-entry").then((module) => module.ManualEntryForm),
);
export const ManualRequirements = dynamic(() =>
  import("./manual-requirements").then((module) => module.ManualRequirements),
);
export const PlanItemRow = dynamic(() =>
  import("./plan-item-row").then((module) => module.PlanItemRow),
);
export const PrintButton = dynamic(() =>
  import("./print-button").then((module) => module.PrintButton),
);
export const SuggestionsPanel = dynamic(() =>
  import("./suggestions-panel").then((module) => module.SuggestionsPanel),
);
export const SummerEditor = dynamic(() =>
  import("./summer-editor").then((module) => module.SummerEditor),
);

/** The chunks each lazily loaded view needs (Next semester has none: it ships with the page). */
const VIEW_CHUNKS: Readonly<Partial<Record<PlanTab, () => Promise<unknown>[]>>> = {
  "four-year": () => [
    import("./manual-entry"),
    import("./manual-requirements"),
    import("./plan-item-row"),
  ],
  suggestions: () => [import("./suggestions-panel")],
  summer: () => [import("./summer-editor")],
};

/** Start loading a view's islands (a failure is left for the view itself to meet, and report, when it renders). */
export function preloadPlanView(tab: PlanTab): void {
  for (const chunk of VIEW_CHUNKS[tab]?.() ?? []) chunk.catch(() => undefined);
}
