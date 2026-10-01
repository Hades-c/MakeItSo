import type * as React from "react";
import type { Metadata } from "next";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { readEnv } from "@/server/env";
import { FourYearTab } from "./_components/four-year";
import { NextSemesterTab } from "./_components/next-semester";
import { PlanTabs } from "./_components/plan-tabs";
import { WebTreePrintView } from "./_components/print-view";
import { SuggestionsTab } from "./_components/suggestions";
import { SummerEditor } from "./_components/summer-editor";
import { TAB_LABELS } from "./_lib/labels";
import { loadFourYear, loadNextSemester, loadSuggestions, loadSummer } from "./_lib/load";
import { parsePlanParams, type SearchParamsRecord } from "./_lib/tabs";

export const metadata: Metadata = { title: "My plan" };

/**
 * /plan (PLAN §3; W5u). Four views, the current one in the URL (?tab=next|four-year|suggestions|summer):
 *   - Next semester: the WebTree list for the registration term (ranked choices + alternates, conflicts, week
 *     grid, seats, slots, restriction flags, Copy for WebTree, print view at &view=print) and the registration
 *     dates from the academic calendar;
 *   - 4-year plan: degree map, term-by-term courses, manual entries, the unofficial requirements tracker;
 *   - Suggestions: AI drafts, accepted per course (R2; explained away when AI is not available);
 *   - Summer: summer plans.
 * Server component: only the current view's data is loaded, straight from the services (server/plan, catalog,
 * the AI gate), with "now" from server/clock in APP_TIMEZONE. Client islands mutate through lib/api/plan and
 * refresh the page.
 */
export default async function PlanPage({
  searchParams,
}: { searchParams?: Promise<SearchParamsRecord> } = {}) {
  const user = await requireUser();
  const params = parsePlanParams((await searchParams) ?? {});
  const at = now();
  const timeZone = readEnv("APP_TIMEZONE");

  let body: React.ReactNode;
  switch (params.tab) {
    case "next": {
      const loaded = await loadNextSemester(user.id, params.term);
      body = params.print ? (
        <WebTreePrintView loaded={loaded} now={at} timeZone={timeZone} />
      ) : (
        <NextSemesterTab loaded={loaded} now={at} timeZone={timeZone} />
      );
      break;
    }
    case "four-year":
      body = <FourYearTab loaded={await loadFourYear(user.id)} />;
      break;
    case "suggestions":
      body = <SuggestionsTab loaded={await loadSuggestions(user.id)} timeZone={timeZone} />;
      break;
    case "summer": {
      const loaded = await loadSummer(user.id);
      body = loaded.ok ? (
        <SummerEditor {...loaded.data} />
      ) : (
        <ErrorState title="Summer plans could not load" description={loaded.message} />
      );
      break;
    }
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="My plan"
          subtitle="Next semester, your four-year plan, suggestions and summers, in one place."
        />
      </div>
      <PlanTabs active={params.tab}>
        <section aria-label={TAB_LABELS[params.tab]} data-testid={`plan-tab-${params.tab}`}>
          {body}
        </section>
      </PlanTabs>
    </>
  );
}
