import Link from "next/link";
import { AlarmClock, ExternalLink, TriangleAlert } from "lucide-react";
import { AiChip } from "@/components/ui/ai-chip";
import { CourseCode } from "@/components/ui/course-code";
import { SectionCard } from "@/components/ui/section-card";
import { runHeads, SourceNote, viaLabel } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import { SOURCES } from "@/lib/sources";
import { cn } from "@/lib/utils";
import { loadFlags } from "@/server/features";
import {
  buildDueSoon,
  contentDeadlines,
  dueForYouCount,
  dueLabel,
  dueSoonRange,
  groupDueSoon,
  loadPlan,
  loadProfile,
  loadTerms,
  safely,
  standingOf,
  wantsSyllabiPointer,
  type DueSoonItem,
} from "@/server/today";
import { STRETCHED_LINK } from "../_lib/styles";
import { DueSoonTabs } from "./due-soon-tabs";
import { PanelError } from "./panel-states";
import { ShowMore } from "./show-more";

/** Rows listed before "Show N more" (the student's own rows are always listed, however many). */
export const DUE_SOON_SHOWN = 8;

/**
 * The card's name, in every state: its title, the page's loading and error cards for it, and its own error line
 * ("Due for you could not load right now").
 */
export const DUE_SOON_TITLE = "Due for you";

/**
 * Due for you (PLAN §3 "Due soon"): the academic calendar's deadlines and registration windows, the curated office
 * programs' deadlines and the student's own, for the next two weeks, each with a link to the page that publishes
 * it and its source in its meta line (`dueSourceNote`), said once per run of consecutive rows from one source.
 * The rows for the student (their own, and those whose audience certainly includes them) come first and are what
 * the count counts, the same number as the header's "N due for you". The others say who they are for and follow
 * under "Also in the next two weeks", by date; past DUE_SOON_SHOWN rows the rest are one press away ("Show N
 * more"), never cut. Only the student's rows are ever drawn in the urgent
 * red. When the plan cannot load, the curated rows are still listed, with a one-line note that the student's own
 * are missing.
 *
 * All/Coursework (PLAN-UX §4): "Coursework" is the same rows filtered to class work (`isCoursework`): every row
 * tied to a course, and every deadline a syllabus added or the student's Moodle calendar imported, with or without
 * a course code (a Moodle course name that names no Davidson course, such as an advising site, gives none),
 * grouped and counted the same way; each tab says how many rows in it are for the student. Both views are built
 * and rendered up front; DueSoonTabs only shows one at a time.
 *
 * A student with classes this term and no syllabus or Moodle connection gets one quiet line at the end pointing to
 * /syllabi (wantsSyllabiPointer).
 */
export async function DueSoonPanel({ userId, now }: { userId: string; now: Date }) {
  const [plan, profile, terms] = await Promise.all([
    loadPlan(userId),
    loadProfile(userId),
    loadTerms(),
  ]);
  const moodleOn = loadFlags().moodle;
  const pointer = plan.ok
    ? await wantsSyllabiPointer(userId, plan.value, terms.ok ? terms.value.current : null)
    : false;
  const { from, to } = dueSoonRange(now);
  // The curated rows never depend on the plan: without it, they are still listed, with a note.
  const built = safely(DUE_SOON_TITLE, () => {
    const items = buildDueSoon({
      now,
      standing: standingOf(profile),
      contentDeadlines: contentDeadlines(from, to),
      studentDeadlines: plan.ok ? plan.value.deadlines : [],
    });
    return { items, forYouCount: dueForYouCount(items) };
  });
  if (!built) return <PanelError id="due-soon" title={DUE_SOON_TITLE} what={DUE_SOON_TITLE} />;
  const { items, forYouCount } = built;
  const classItems = items.filter(isCoursework);

  return (
    <SectionCard id="due-soon" title={DUE_SOON_TITLE} count={forYouCount}>
      {plan.ok ? null : (
        <p
          role="status"
          data-testid="due-soon-own-error"
          className="mb-2 flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-fg-2"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>Your own deadlines could not load right now.</span>
        </p>
      )}
      <DueSoonTabs
        counts={{ all: forYouCount, classes: dueForYouCount(classItems) }}
        all={<DueSoonList items={items} now={now} />}
        classes={
          <>
            <p className="mb-2 text-sm text-fg-2" data-testid="due-coursework-note">
              Only deadlines for your courses. Registrar and office deadlines are under All.
            </p>
            <DueSoonList
              items={classItems}
              now={now}
              empty="Nothing due for your classes in the next two weeks."
            />
          </>
        }
      />
      {pointer ? (
        <p className="mt-3 border-t border-line pt-1 text-sm md:pt-3" data-testid="syllabi-pointer">
          <Link
            href={routes.syllabi()}
            className="inline-flex min-h-11 items-center font-medium link md:min-h-0"
          >
            {moodleOn ? "Add your syllabi or connect Moodle" : "Add your syllabi"} to see your class
            deadlines here
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}

/** Class work: a row tied to a course, or one read from a syllabus or imported from Moodle (Coursework tab). */
export function isCoursework(item: DueSoonItem): boolean {
  return item.courseCode !== null || item.fromSyllabus || item.source === "course-site";
}

function DueSoonList({
  items,
  now,
  empty = "Nothing due in the next two weeks.",
}: {
  items: readonly DueSoonItem[];
  now: Date;
  empty?: string;
}) {
  const { forYou, also, more } = groupDueSoon(items, DUE_SOON_SHOWN);
  const rows = (list: readonly DueSoonItem[]) => {
    const heads = runHeads(list.map((item) => dueSourceNote(item)?.label ?? null));
    return list.map((item, i) => (
      <DueSoonRow
        key={item.id}
        item={item}
        label={dueLabel(item, now)}
        showSource={heads[i] ?? true}
      />
    ));
  };

  return (
    <>
      {items.length === 0 ? (
        <p className="text-sm text-fg-2">{empty}</p>
      ) : forYou.length === 0 ? (
        <p className="text-sm text-fg-2" data-testid="due-for-you-none">
          Nothing due for you in the next two weeks.
        </p>
      ) : (
        <ol
          className="-mt-1 divide-y divide-line"
          aria-label="Due for you in the next two weeks"
          data-testid="due-for-you"
        >
          {rows(forYou)}
        </ol>
      )}
      {also.length + more.length > 0 ? (
        <div className="mt-3 border-t border-line pt-3" data-testid="due-also">
          <h3 id="due-soon-also" className="text-sm font-semibold text-fg-2">
            Also in the next two weeks
          </h3>
          {also.length > 0 ? (
            <ol className="divide-y divide-line" aria-labelledby="due-soon-also">
              {rows(also)}
            </ol>
          ) : null}
          {more.length > 0 ? (
            <ShowMore count={more.length} context="in the next two weeks">
              <ol
                className="divide-y divide-line border-t border-line"
                aria-label="More in the next two weeks"
              >
                {rows(more)}
              </ol>
            </ShowMore>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * What a row's meta line says about where it came from, or null when that is obvious: the student's own typed
 * deadline says nothing (the card is "Due for you" and the title is theirs; screen readers still hear "Source:
 * your plan"). A syllabus deadline says "From your syllabus" with the AI chip (an AI read it); an imported one
 * names its course site; a calendar or program row says "via Registrar", "via Matthews Center" or "via <office>".
 */
export function dueSourceNote(
  item: Pick<DueSoonItem, "source" | "fromSyllabus" | "office">,
): { label: string; ai: boolean } | null {
  if (item.source === "my-plan") {
    return item.fromSyllabus ? { label: "From your syllabus", ai: true } : null;
  }
  if (SOURCES[item.source].kind === "link") return { label: SOURCES[item.source].label, ai: false };
  return { label: viaLabel(item.source, item.office), ai: false };
}

function DueSoonRow({
  item,
  label,
  showSource,
}: {
  item: DueSoonItem;
  label: string;
  /** False for a row after the first of a run with the same source note: screen readers only. */
  showSource: boolean;
}) {
  // Red is for now, and for the student's own rows due today (PLAN §7): never another class year's deadline.
  const urgent = item.forYou && !item.endDay && label.startsWith("Today");
  const title = item.label ? `${item.title}: ${item.label}` : item.title;
  const note = dueSourceNote(item);
  return (
    <li
      data-testid="due-soon-item"
      data-source={item.source}
      data-kind={item.kind}
      data-for-you={item.forYou ? "true" : "false"}
      data-urgent={urgent ? "true" : undefined}
      className="relative flex min-h-11 items-start justify-between gap-3 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm leading-snug font-semibold text-fg md:text-base">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className={STRETCHED_LINK}>
              {title} <span className="sr-only">(opens in a new tab)</span>
              <ExternalLink aria-hidden className="inline size-3.5 align-[-0.125em] text-fg-3" />
            </a>
          ) : (
            title
          )}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2 md:text-sm">
          {item.courseCode ? <CourseCode code={item.courseCode} /> : null}
          {item.audience && !item.forYou ? <span>For: {item.audience}</span> : null}
          {note ? (
            <>
              <SourceNote source={item.source} label={note.label} hidden={!showSource} />
              {note.ai ? <AiChip compact label="read from your syllabus: check the dates" /> : null}
            </>
          ) : (
            <SourceNote source={item.source} label="your plan" hidden />
          )}
        </p>
      </div>
      {/* Due today (the student's own): red, and never by colour alone (red is also the accent): an alarm icon and
          the words. */}
      <p
        className={cn(
          "flex shrink-0 items-start justify-end gap-1 text-right text-xs leading-5",
          urgent ? "font-semibold text-urgent" : "font-medium text-fg-2",
        )}
      >
        {urgent ? (
          <AlarmClock
            aria-hidden
            data-testid="due-urgent-icon"
            className="mt-0.75 size-3.5 shrink-0"
          />
        ) : null}
        {label}
      </p>
    </li>
  );
}
