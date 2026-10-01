import { ExternalLink } from "lucide-react";
import { CourseCode } from "@/components/ui/course-code";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { cn } from "@/lib/utils";
import {
  buildDueSoon,
  contentDeadlines,
  dueLabel,
  dueSoonRange,
  loadPlan,
  loadProfile,
  pickShown,
  standingOf,
  type DueSoonItem,
} from "@/server/today";
import { STRETCHED_LINK } from "../_lib/styles";
import { PanelError } from "./panel-states";

/** Rows shown before "and n more". */
export const DUE_SOON_SHOWN = 8;

/**
 * Due soon (PLAN §3): the academic calendar's deadlines and registration windows, the curated office programs'
 * deadlines and the student's own, for the next two weeks, each with the tag of its stored source and a link to
 * the page that publishes it. Rows for other class years or a conditional audience say who they are for.
 */
export async function DueSoonPanel({ userId, now }: { userId: string; now: Date }) {
  const [plan, profile] = await Promise.all([loadPlan(userId), loadProfile(userId)]);
  if (!plan.ok) return <PanelError id="due-soon" title="Due soon" what="Your deadlines" />;
  const { from, to } = dueSoonRange(now);
  const items = buildDueSoon({
    now,
    standing: standingOf(profile),
    contentDeadlines: contentDeadlines(from, to),
    studentDeadlines: plan.value.deadlines,
  });
  const shown = pickShown(items, DUE_SOON_SHOWN);
  const more = items.length - shown.length;

  return (
    <SectionCard id="due-soon" title="Due soon" count={items.length}>
      {items.length === 0 ? (
        <p className="text-sm text-fg-2">Nothing due in the next two weeks.</p>
      ) : (
        <ol className="-mt-1 divide-y divide-line" aria-label="Due in the next two weeks">
          {shown.map((item) => (
            <DueSoonRow key={item.id} item={item} now={now} />
          ))}
        </ol>
      )}
      {more > 0 ? (
        <p className="mt-2 text-sm text-fg-3">And {more} more in the next two weeks.</p>
      ) : null}
    </SectionCard>
  );
}

function DueSoonRow({ item, now }: { item: DueSoonItem; now: Date }) {
  const label = dueLabel(item, now);
  const urgent = !item.endDay && label.startsWith("Today");
  const title = item.label ? `${item.title}: ${item.label}` : item.title;
  return (
    <li
      data-testid="due-soon-item"
      data-aggregated={item.source}
      data-kind={item.kind}
      className="relative flex min-h-11 items-start justify-between gap-3 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm leading-snug font-semibold text-fg md:text-base">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(STRETCHED_LINK, "hover:text-primary")}
            >
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
      <p
        className={cn(
          "shrink-0 text-right font-mono text-xs leading-5 font-medium",
          urgent ? "text-urgent" : "text-fg-2",
        )}
      >
        {label}
      </p>
    </li>
  );
}
