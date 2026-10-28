import { FiveDayStrip } from "@/components/domain/five-day-strip";
import { PageHeader } from "@/components/ui/page-header";
import { formatLongDate } from "@/lib/format";
import {
  contentDeadlines,
  etDay,
  loadPlan,
  loadProfile,
  loadSchedule,
  loadTerms,
  safely,
  scheduleTermLabel,
  standingOf,
  STRIP_NOUN,
  stripCount,
  stripDay,
} from "@/server/today";
import { todayHref } from "../_lib/params";

export interface TodayHeaderProps {
  userId: string;
  now: Date;
  timeZone: string;
  stripDays: readonly string[];
  /** The day the timeline shows. */
  selected: string;
}

/**
 * The Today header: the date and term as a kicker, a fixed headline, and the five-day strip.
 */
export async function TodayHeader({
  userId,
  now,
  timeZone,
  stripDays,
  selected,
}: TodayHeaderProps) {
  const today = etDay(now);
  const [profile, terms, schedule, plan, week] = await Promise.all([
    loadProfile(userId),
    loadTerms(),
    loadSchedule(userId, today),
    loadPlan(userId),
    Promise.all(stripDays.map((day) => loadSchedule(userId, day))),
  ]);
  const standing = standingOf(profile);
  const termLabel = scheduleTermLabel(schedule, terms);
  const studentDeadlines = plan.ok ? plan.value.deadlines : [];

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
      title={<span data-testid="day-summary">Your day at Davidson</span>}
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
