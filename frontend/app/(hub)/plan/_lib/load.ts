import "server-only";
import { unstable_rethrow } from "next/navigation";
import { compareTerms, isSummer, termLabel, type TermCode } from "@/lib/term";
import { aiGateFailure, type AiFailure } from "@/lib/types/ai";
import type { ReqCode } from "@/lib/types/catalog";
import {
  REQUIREMENT_SLOTS,
  type PlanDraft,
  type PlanItem,
  type PlanView,
  type RequirementSlot,
  type SummerActivity,
} from "@/lib/types/plan";
import { aiGateInput } from "@/server/ai";
import { getSection, resolveTerms } from "@/server/catalog";
import { now } from "@/server/clock";
import { REQUIREMENTS_DISCLAIMER, requirementName } from "@/server/content/requirements";
import { ApiError } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";
import {
  getPlan,
  getProgress,
  getWebTreeReport,
  listDrafts,
  type RequirementsReport,
  type WebTreeReport,
  type WebTreeSectionDetail,
} from "@/server/plan";
import { loadPlanContext } from "@/server/plan/context";
import { planTerms as planTermsOf, type PlanContext } from "@/server/plan/terms";
import type { SlotFiller } from "./choice";
import type { DeadlineInput } from "./deadlines";
import { isActive } from "./four-year";
import type { SectionTimes } from "./week";

/**
 * Server loaders for the /plan tabs (PLAN §3, §5). Server components call the services directly (no self-HTTP):
 * server/plan (W5s), server/catalog (W1), server/ai's gate (W6). Every value returned is plain, serialisable
 * data for the client islands. A failure the student cannot fix (the schedule unreachable) becomes a typed
 * `{ ok: false, message }` the tab renders in an ErrorState; a missing test fixture is never hidden.
 */

export type Loaded<T> = { ok: true; data: T } | { ok: false; message: string };

const UNAVAILABLE = "Your plan could not be loaded right now. Please try again in a minute.";

async function guard<T>(what: string, load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    if (error instanceof ApiError && error.status < 500) {
      return { ok: false, message: error.message };
    }
    console.error(`[plan] could not load ${what}:`, error);
    return { ok: false, message: UNAVAILABLE };
  }
}

/** Official names of the tracker slots (server/content/requirements), PE written out. */
export function slotLabels(): Record<RequirementSlot, string> {
  const labels = {} as Record<RequirementSlot, string>;
  for (const slot of REQUIREMENT_SLOTS) {
    labels[slot] =
      slot === "PE" ? "Physical Education" : requirementName(slot as Exclude<ReqCode, "NONE">);
  }
  return labels;
}

/** The item filling each slot (first of filledBy), for "already planned (BIO 115, Fall 2027)". */
function slotFillers(
  progress: RequirementsReport,
  items: readonly PlanItem[],
): Partial<Record<RequirementSlot, SlotFiller>> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const out: Partial<Record<RequirementSlot, SlotFiller>> = {};
  for (const slot of REQUIREMENT_SLOTS) {
    const item = (progress.filledBy[slot] ?? []).map((id) => byId.get(id)).find(Boolean);
    if (item) out[slot] = { courseCode: item.courseCode, termCode: item.termCode };
  }
  return out;
}

// ---- Next semester -----------------------------------------------------------------------------------------------

export interface PlanCourseOption {
  courseCode: string;
  title: string;
  crn: string | null;
}

export interface NextSemesterData {
  termCode: TermCode;
  termLabel: string;
  registrationTerm: TermCode;
  report: Omit<WebTreeReport, "deadlines" | "details"> & {
    details: { rank: number; choice: WebTreeSectionDetail; alternates: WebTreeSectionDetail[] }[];
  };
  /** Meetings and instructors per listed CRN (the catalog's section). */
  sections: Record<string, SectionTimes & { instructors: string[] }>;
  deadlines: DeadlineInput[];
  /** Active plan items in this term, for "Add from your plan". */
  planCourses: PlanCourseOption[];
  slotLabels: Record<RequirementSlot, string>;
  slotFillers: Partial<Record<RequirementSlot, SlotFiller>>;
}

function instructorNames(
  instructors: readonly { first: string; last: string; isStaff: boolean }[],
): string[] {
  return instructors.map((person) =>
    person.isStaff ? "Staff (TBA)" : `${person.first} ${person.last}`.trim(),
  );
}

/**
 * The Next semester tab: the WebTree list for the registration term (or a later `term` in the plan) with the
 * plan service's report, the sections' meetings and the registration deadlines from the academic calendar.
 */
export async function loadNextSemester(
  userId: string,
  requested: TermCode | null,
): Promise<Loaded<NextSemesterData>> {
  return guard("the WebTree list", async () => {
    const at = now();
    const terms = await resolveTerms({ now: at });
    const termCode =
      requested && !isSummer(requested) && compareTerms(requested, terms.registration) >= 0
        ? requested
        : terms.registration;
    const [report, plan, progress] = await Promise.all([
      getWebTreeReport(userId, termCode, { terms }),
      getPlan(userId),
      getProgress(userId, { now: at }),
    ]);
    const crns = [
      ...new Set(report.list.choices.flatMap((choice) => [choice.crn, ...choice.alternates])),
    ];
    const found = await Promise.all(crns.map((crn) => getSection(termCode, crn)));
    const sections: NextSemesterData["sections"] = {};
    for (const section of found) {
      if (!section) continue;
      sections[section.crn] = {
        crn: section.crn,
        courseCode: section.courseCode,
        section: section.section,
        title: section.title,
        meetings: section.meetings,
        instructors: instructorNames(section.instructors),
      };
    }
    const planCourses = plan.items
      .filter((item) => item.termCode === termCode && isActive(item))
      .map((item) => ({ courseCode: item.courseCode, title: item.title, crn: item.crn ?? null }));
    const { deadlines, ...rest } = report;
    return {
      termCode,
      termLabel: termLabel(termCode),
      registrationTerm: terms.registration,
      report: rest,
      sections,
      deadlines: deadlines.map((deadline) => ({
        id: deadline.id,
        title: deadline.title,
        date: deadline.date,
        endDate: deadline.endDate,
        time: deadline.time,
        source: deadline.source,
        url: deadline.url,
      })),
      planCourses,
      slotLabels: slotLabels(),
      slotFillers: slotFillers(progress as RequirementsReport, plan.items),
    };
  });
}

// ---- 4-year plan -------------------------------------------------------------------------------------------------

export interface FourYearData {
  plan: PlanView;
  progress: RequirementsReport;
  context: PlanContext;
  planTerms: TermCode[];
  current: TermCode;
  registration: TermCode;
  slotLabels: Record<RequirementSlot, string>;
  disclaimer: string;
}

export async function loadFourYear(userId: string): Promise<Loaded<FourYearData>> {
  return guard("the 4-year plan", async () => {
    const at = now();
    const [plan, progress, context, terms] = await Promise.all([
      getPlan(userId),
      getProgress(userId, { now: at }),
      loadPlanContext(userId, at),
      resolveTerms({ now: at }),
    ]);
    return {
      plan,
      progress: progress as RequirementsReport,
      context,
      planTerms: planTermsOf(context),
      current: terms.current,
      registration: terms.registration,
      slotLabels: slotLabels(),
      disclaimer: REQUIREMENTS_DISCLAIMER,
    };
  });
}

// ---- Suggestions ---------------------------------------------------------------------------------------------------

export interface SuggestionsData {
  /** Why AI suggestions are not available to this student (AI off, not set up, unverified, no consent). */
  gate: AiFailure | null;
  drafts: PlanDraft[];
  items: PlanItem[];
  registration: TermCode;
  registrationLabel: string;
  /** Regular terms from the registration term to the end of the plan (targets for suggestions). */
  targetTerms: TermCode[];
}

export async function loadSuggestions(userId: string): Promise<Loaded<SuggestionsData>> {
  return guard("suggestions", async () => {
    const at = now();
    const [gateInput, terms, context] = await Promise.all([
      aiGateInput(userId, "plan-suggestions"),
      resolveTerms({ now: at }),
      loadPlanContext(userId, at),
    ]);
    const gate = aiGateFailure(gateInput);
    const targetTerms = planTermsOf(context).filter(
      (termCode) => !isSummer(termCode) && compareTerms(termCode, terms.registration) >= 0,
    );
    if (gate) {
      // AI is unavailable to this student: no drafts are shown (they are AI output).
      return {
        gate,
        drafts: [],
        items: [],
        registration: terms.registration,
        registrationLabel: termLabel(terms.registration),
        targetTerms,
      };
    }
    const [drafts, plan] = await Promise.all([listDrafts(userId), getPlan(userId)]);
    return {
      gate,
      drafts: drafts.filter((draft) => draft.kind === "plan-suggestions"),
      items: plan.items,
      registration: terms.registration,
      registrationLabel: termLabel(terms.registration),
      targetTerms,
    };
  });
}

// ---- Summer -------------------------------------------------------------------------------------------------------

export interface SummerData {
  activities: SummerActivity[];
  /** Summer terms of the plan (YYYY03), oldest first. */
  summerTerms: TermCode[];
  /** The next summer from today: the form's default. */
  defaultTerm: TermCode | null;
}

export async function loadSummer(userId: string): Promise<Loaded<SummerData>> {
  return guard("summer plans", async () => {
    const at = now();
    const [plan, context, terms] = await Promise.all([
      getPlan(userId),
      loadPlanContext(userId, at),
      resolveTerms({ now: at }),
    ]);
    const summerTerms = planTermsOf(context).filter((termCode) => isSummer(termCode));
    const defaultTerm =
      summerTerms.find((termCode) => compareTerms(termCode, terms.current) > 0) ??
      summerTerms[summerTerms.length - 1] ??
      null;
    return {
      activities: [...plan.summer].sort((a, b) => compareTerms(a.termCode, b.termCode)),
      summerTerms,
      defaultTerm,
    };
  });
}
