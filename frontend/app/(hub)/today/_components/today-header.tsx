import { FiveDayStrip } from "@/components/domain/five-day-strip";
import { PageHeader } from "@/components/ui/page-header";
import { formatLongDate } from "@/lib/format";
import {
  buildDueSoon,
  contentDeadlines,
  dueSoonRange,
  etDay,
  loadFeedItems,
  loadPlan,
  loadProfile,
  loadSchedule,
  loadTerms,
  ownDeadlineCount,
  safely,
  scheduleTermLabel,
  standingOf,
  STRIP_NOUN,
  stripCount,
  stripDay,
  todaySummary,
  type Loaded,
} from "@/server/today";
import type { FeedItem } from "@/lib/types/feeds";
import { feedRange, todayHref } from "../_lib/params";

export interface TodayHeaderProps {
  userId: string;
  now: Date;
  timeZone: string;
  stripDays: readonly string[];
  /** The day the timeline shows. */
  selected: string;
  /** FEATURE_EVENTS: campus events count in the summary only while the events section is on. */
  eventsOn: boolean;
  /** The student's first name for the greeting. */
  firstName?: string;
}

const NO_FEEDS: Loaded<FeedItem[]> = { ok: true, value: [] };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The Today header (Lakeside + Broadsheet): the date and term as a kicker, the deterministic one-sentence day
 * summary as the h1 (server/today summary → lib/day-summary), a line of counts, and the five-day strip. Whatever
 * fails to load is left out of the sentence, so the headline itself never fails.
 */
export async function TodayHeader({
  userId,
  now,
  timeZone,
  stripDays,
  selected,
  eventsOn,
  firstName,
}: TodayHeaderProps) {
  const today = etDay(now);
  const range = feedRange(today, stripDays);
  const [profile, terms, schedule, plan, feeds, week] = await Promise.all([
    loadProfile(userId),
    loadTerms(),
    loadSchedule(userId, today),
    loadPlan(userId),
    eventsOn ? loadFeedItems(range.from, range.to) : Promise.resolve(NO_FEEDS),
    Promise.all(stripDays.map((day) => loadSchedule(userId, day))),
  ]);
  const standing = standingOf(profile);
  const termLabel = scheduleTermLabel(schedule, terms);
  const studentDeadlines = plan.ok ? plan.value.deadlines : [];
  const summary = safely("the day summary", () =>
    todaySummary({
      now,
      onboarded: profile.ok ? profile.value.onboardedAt !== null : true,
      standing,
      schedule: schedule.ok ? schedule.value : null,
      termLabel,
      studentDeadlines,
      feedItems: feeds.ok ? feeds.value : [],
    }),
  );
  const { from, to } = dueSoonRange(now);
  const dueForYou = safely("the deadline count", () =>
    ownDeadlineCount(
      buildDueSoon({
        now,
        standing,
        contentDeadlines: contentDeadlines(from, to),
        studentDeadlines,
      }),
    ),
  );

  const days = safely("the week strip", () => {
    const curated = contentDeadlines(stripDays[0] ?? today, stripDays.at(-1) ?? today);
    return stripDays.map((day, i) => {
      const loaded = week[i];
      const input = { day, schedule: loaded?.ok ? loaded.value : null };
      return stripDay(input, {
        today,
        selected,
        count: stripCount(input, studentDeadlines, curated, standing),
        href: (d) => todayHref(d, today),
      });
    });
  });

  return (
    <PageHeader
      kicker={
        <>
          <time dateTime={today}>{formatLongDate(now, timeZone)}</time>
          {termLabel ? ` · ${termLabel}` : null}
        </>
      }
      title={
        <span data-testid="day-summary">
          {/* Only if the summary itself throws: a plain title, never a made-up sentence. */}
          {summary?.sentence ?? "Your day at Davidson"}
        </span>
      }
      subtitle={
        <span data-testid="day-counts">
          {firstName ? <span className="mr-1">Welcome, {firstName}.</span> : null}
          {summary ? (
            <>
              <b>{plural(summary.classesToday, "class", "classes")}</b> today
            </>
          ) : null}
          {summary && dueForYou !== null ? " · " : null}
          {dueForYou === null ? null : (
            <>
              <b>{plural(dueForYou, "deadline", "deadlines")}</b> in the next two weeks
            </>
          )}
        </span>
      }
      actions={
        days ? (
          <FiveDayStrip
            days={days}
            label="This school week"
            noun={STRIP_NOUN}
            className="w-full md:w-auto"
          />
        ) : undefined
      }
    />
  );
}
