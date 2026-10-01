"use client";

import Link from "next/link";
import useSWR from "swr";
import { CourseCode } from "@/components/ui/course-code";
import { SourceTag } from "@/components/ui/source-tag";
import { callApi } from "@/lib/api/client";
import { catalogApi } from "@/lib/api/catalog";
import { courseSlug, routes } from "@/lib/routes";
import { compareTerms, termLabel, type TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";
import type { CareerPlan } from "@/lib/types/ai";
import type { PlanDraft } from "@/lib/types/plan";

/**
 * The AI career plan's course picks, each with its OFFICIAL title and live term availability from the catalog
 * (PLAN §5 "AI grounding": the UI never shows a model-written title, prerequisites, difficulty or workload). The
 * model's answer carries only {courseCode, termCode, reason}; each row reads the public catalog routes:
 *
 *   GET /api/catalog/availability?code=…   the course's history (first ingested term → the term after registration)
 *   GET /api/catalog/courses/<term>/<code> the official title, from the pick's term when it is offered there,
 *                                          else from the latest term that offered it
 *
 * Until they answer the row shows the code only; when they fail it says availability could not be loaded (never
 * a guess). An unpublished target term reads "Not yet scheduled — based on past offerings" when the draft says so
 * (PLAN §5), else "<term> isn’t published yet", plus "usually offered" when the catalog supports it.
 */

export type CoursePick = CareerPlan["courses"][number];
export type DraftBasis = NonNullable<PlanDraft["items"][number]["basis"]>;

export const PAST_OFFERINGS_TEXT = "Not yet scheduled — based on past offerings";

/** The term whose catalog entry gives the official title: the pick's term if offered, else the latest offered. */
export function titleTermOf(history: readonly Availability[], pickTerm: TermCode): TermCode | null {
  const offered = history.filter((entry) => entry.status === "offered");
  if (offered.some((entry) => entry.termCode === pickTerm)) return pickTerm;
  const latest = [...offered].sort((a, b) => compareTerms(b.termCode, a.termCode))[0];
  return latest?.termCode ?? null;
}

function sections(count: number | undefined): string {
  if (count === undefined) return "";
  return ` (${count} ${count === 1 ? "section" : "sections"})`;
}

function joinLabels(codes: readonly TermCode[]): string {
  const labels = codes.map(termLabel);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** One sentence for the pick's target term, from the catalog history (and the draft's basis). */
export function pickTermText(
  history: readonly Availability[],
  pickTerm: TermCode,
  basis?: DraftBasis,
): string {
  const label = termLabel(pickTerm);
  const entry = history.find((e) => e.termCode === pickTerm);
  if (entry?.status === "offered") return `Offered in ${label}${sections(entry.sectionCount)}`;
  if (entry?.status === "not-offered") return `Not offered in ${label}`;
  const head =
    basis === "past-offerings"
      ? `${label}: ${PAST_OFFERINGS_TEXT}`
      : `${label} isn’t published yet`;
  if (entry?.usually) {
    const basedOn = entry.usually.basedOn.length
      ? ` (based on ${joinLabels(entry.usually.basedOn)})`
      : "";
    return `${head}. Usually offered in ${entry.usually.season}${basedOn}`;
  }
  return head;
}

/** The career page's terms as "Fall 2026: Offered (2 sections)" lines; terms the history does not report are left out. */
export function careerTermLines(
  history: readonly Availability[],
  terms: readonly TermCode[],
): string[] {
  const out: string[] = [];
  for (const code of terms) {
    const entry = history.find((e) => e.termCode === code);
    if (!entry) continue;
    const status =
      entry.status === "offered"
        ? `Offered${sections(entry.sectionCount)}`
        : entry.status === "not-offered"
          ? "Not offered"
          : "Not yet published";
    out.push(`${termLabel(code)}: ${status}`);
  }
  return out;
}

interface PickFacts {
  history: Availability[];
  title: string | null;
  titleTerm: TermCode | null;
}

async function loadPickFacts(code: string, pickTerm: TermCode): Promise<PickFacts> {
  const { availability } = await callApi(catalogApi.availability, { query: { code } });
  const titleTerm = titleTermOf(availability, pickTerm);
  if (!titleTerm) return { history: availability, title: null, titleTerm: null };
  try {
    const { course } = await callApi(catalogApi.course, {
      params: { term: titleTerm, code: courseSlug(code) },
    });
    return { history: availability, title: course.title, titleTerm };
  } catch {
    // The availability is still worth showing; the title falls back to the code alone.
    return { history: availability, title: null, titleTerm };
  }
}

function PickRow({
  pick,
  basis,
  careerTerms,
}: {
  pick: CoursePick;
  basis?: DraftBasis;
  careerTerms: readonly TermCode[];
}) {
  const { data, error, isLoading } = useSWR(
    ["career-ai-pick", pick.courseCode, pick.termCode],
    () => loadPickFacts(pick.courseCode, pick.termCode),
    { revalidateOnFocus: false },
  );
  const href = data?.titleTerm ? routes.course(data.titleTerm, pick.courseCode) : null;
  const termLines = data ? careerTermLines(data.history, careerTerms) : [];

  return (
    <li
      className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-bg p-3.5"
      data-testid="ai-course-pick"
      data-course={pick.courseCode}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <CourseCode code={pick.courseCode} variant="chip" />
        {href ? (
          <Link
            href={href}
            className="inline-flex min-h-11 items-center font-semibold text-fg hover:underline md:min-h-0"
            data-testid="ai-course-title"
          >
            {data?.title ?? `${pick.courseCode} in the catalog`}
          </Link>
        ) : data?.title ? (
          <span className="font-semibold text-fg" data-testid="ai-course-title">
            {data.title}
          </span>
        ) : null}
      </p>
      <p className="text-sm text-fg-2">{pick.reason}</p>
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        data-aggregated="course-schedule"
      >
        {isLoading ? (
          <span className="text-fg-3">Checking the schedule…</span>
        ) : error || !data ? (
          <span className="text-fg-3">The schedule for this course couldn’t be loaded.</span>
        ) : (
          <span className="font-semibold text-fg" data-testid="ai-course-term">
            {pickTermText(data.history, pick.termCode, basis)}
          </span>
        )}
        <SourceTag source="course-schedule" />
      </div>
      {termLines.length > 0 ? (
        <ul
          className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-2"
          aria-label="Availability by term"
        >
          {termLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function AiCoursePicks({
  picks,
  draft,
  careerTerms,
}: {
  picks: readonly CoursePick[];
  draft: PlanDraft | null;
  /** The career page's terms (current, registration, next), for the availability line. */
  careerTerms: readonly TermCode[];
}) {
  const basisOf = (pick: CoursePick) =>
    draft?.items.find(
      (item) => item.courseCode === pick.courseCode && item.termCode === pick.termCode,
    )?.basis;
  return (
    <ul className="grid gap-3 md:grid-cols-2" data-testid="ai-course-picks">
      {picks.map((pick) => (
        <PickRow
          key={`${pick.termCode}:${pick.courseCode}`}
          pick={pick}
          basis={basisOf(pick)}
          careerTerms={careerTerms}
        />
      ))}
    </ul>
  );
}
