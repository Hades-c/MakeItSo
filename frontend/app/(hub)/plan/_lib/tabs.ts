import { PLAN_TABS, parsePlanTab, parseTermParam, routes, type PlanTab } from "@/lib/routes";
import type { TermCode } from "@/lib/term";

/**
 * /plan URL state (PLAN §7 "State": tabs, filters, term and open dialogs live in search params): `tab`
 * (lib/routes parsePlanTab), `term` (a later WebTree term), `view=print` (the WebTree print view). Isomorphic.
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface PlanParams {
  tab: PlanTab;
  term: TermCode | null;
  print: boolean;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePlanParams(params: SearchParamsRecord): PlanParams {
  const tab = parsePlanTab(params.tab);
  return {
    tab,
    term: parseTermParam(params.term),
    print: tab === "next" && first(params.view) === "print",
  };
}

/** routes.plan with the print view as a flag. */
export function planHref(tab: PlanTab, options: { term?: TermCode; print?: boolean } = {}): string {
  return routes.plan(tab, { term: options.term, view: options.print ? "print" : undefined });
}

export { PLAN_TABS };
