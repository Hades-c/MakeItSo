import { ExternalLink, TriangleAlert } from "lucide-react";
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
  safely,
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
 * the page that publishes it. Rows for other class years or a conditional audience say who they are for. When
 * the plan cannot load, the curated rows are still listed, with a one-line note that the student's own are missing.
 */
export async function DueSoonPanel({ userId, now }: { userId: string; now: Date }) {
  const [plan, profile] = await Promise.all([loadPlan(userId), loadProfile(userId)]);
  const { from, to } = dueSoonRange(now);
  // The curated rows never depend on the plan: without it, they are still listed, with a note.
  const built = safely("Due soon", () => {
    const items = buildDueSoon({
      now,
      standing: standingOf(profile),
      contentDeadlines: contentDeadlines(from, to),
      studentDeadlines: plan.ok ? plan.value.deadlines : [],
    });
    const shown = pickShown(items, DUE_SOON_SHOWN).map((item) => ({
      item,
      label: dueLabel(item, now),
    }));
    return { items, shown };
  });
  if (!built) return <PanelError id="due-soon" title="Due soon" what="Due soon" />;
  const { items, shown } = built;
  const more = items.length - shown.length;

  return (
    <SectionCard id="due-soon" title="Due soon" count={items.length}>
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
      {items.length === 0 ? (
        <p className="text-sm text-fg-2">Nothing due in the next two weeks.</p>
      ) : (
        <ol className="-mt-1 divide-y divide-line" aria-label="Due in the next two weeks">
          {shown.map(({ item, label }) => (
            <DueSoonRow key={item.id} item={item} label={label} />
          ))}
        </ol>
      )}
      {more > 0 ? (
        <p className="mt-2 text-sm text-fg-3">And {more} more in the next two weeks.</p>
      ) : null}
    </SectionCard>
  );
}

function DueSoonRow({ item, label }: { item: DueSoonItem; label: string }) {
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
