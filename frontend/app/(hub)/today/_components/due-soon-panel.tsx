import { AlarmClock, ExternalLink, TriangleAlert } from "lucide-react";
import { CourseCode } from "@/components/ui/course-code";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { cn } from "@/lib/utils";
import {
  buildDueSoon,
  contentDeadlines,
  dueLabel,
  dueSoonRange,
  groupDueSoon,
  loadPlan,
  loadProfile,
  safely,
  standingOf,
  type DueSoonItem,
} from "@/server/today";
import { STRETCHED_LINK } from "../_lib/styles";
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
 * programs' deadlines and the student's own, for the next two weeks, each with the tag of its stored source and a
 * link to the page that publishes it. The rows for the student (their own, and those whose audience certainly
 * includes them) come first and are what the count counts, the same number as the header's "N due for you". The
 * others say who they are for and follow under "Also in the next two weeks", by date; past DUE_SOON_SHOWN rows
 * the rest are one press away ("Show N more"), never cut. Only the student's rows are ever drawn in the urgent
 * red. When the plan cannot load, the curated rows are still listed, with a one-line note that the student's own
 * are missing.
 */
export async function DueSoonPanel({ userId, now }: { userId: string; now: Date }) {
  const [plan, profile] = await Promise.all([loadPlan(userId), loadProfile(userId)]);
  const { from, to } = dueSoonRange(now);
  // The curated rows never depend on the plan: without it, they are still listed, with a note.
  const built = safely(DUE_SOON_TITLE, () => {
    const items = buildDueSoon({
      now,
      standing: standingOf(profile),
      contentDeadlines: contentDeadlines(from, to),
      studentDeadlines: plan.ok ? plan.value.deadlines : [],
    });
    const labelled = (rows: readonly DueSoonItem[]) =>
      rows.map((item) => ({ item, label: dueLabel(item, now) }));
    const groups = groupDueSoon(items, DUE_SOON_SHOWN);
    return {
      total: items.length,
      forYou: labelled(groups.forYou),
      also: labelled(groups.also),
      more: labelled(groups.more),
    };
  });
  if (!built) return <PanelError id="due-soon" title={DUE_SOON_TITLE} what={DUE_SOON_TITLE} />;
  const { total, forYou, also, more } = built;
  const rows = (list: typeof forYou) =>
    list.map(({ item, label }) => <DueSoonRow key={item.id} item={item} label={label} />);

  return (
    <SectionCard id="due-soon" title={DUE_SOON_TITLE} count={forYou.length}>
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
      {total === 0 ? (
        <p className="text-sm text-fg-2">Nothing due in the next two weeks.</p>
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
    </SectionCard>
  );
}

function DueSoonRow({ item, label }: { item: DueSoonItem; label: string }) {
  // Red is for now, and for the student's own rows due today (PLAN §7): never another class year's deadline.
  const urgent = item.forYou && !item.endDay && label.startsWith("Today");
  const title = item.label ? `${item.title}: ${item.label}` : item.title;
  return (
    <li
      data-testid="due-soon-item"
      data-aggregated={item.source}
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
          <SourceTag source={item.source} />
          {item.audience && !item.forYou ? <span>For: {item.audience}</span> : null}
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
