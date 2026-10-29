import Link from "next/link";
import { FiveDayStrip } from "@/components/domain/five-day-strip";
import { PageHeader } from "@/components/ui/page-header";
import { formatLongDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import {
  buildDueSoon,
  contentDeadlines,
  dueForYouCount,
  dueSoonRange,
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
  webTreeWindow,
  webTreeWindowText,
} from "@/server/today";
import { todayHref } from "../_lib/params";
import { TEXT_LINK } from "../_lib/styles";

export interface TodayHeaderProps {
  userId: string;
  now: Date;
  timeZone: string;
  stripDays: readonly string[];
  /** The day the timeline shows. */
  selected: string;
}

/**
 * The Today header: the date and term as a kicker, a fixed headline, ONE line under it, and the five-day strip.
 * The line is the WebTree window while it is open ("WebTree is open for Spring 2027 course preferences until Tue,
 * Nov 3 at 5:00 PM · Plan Spring 2027", PLAN §3: during the window only, from the Registrar's calendar), else
 * "N due for you in the next two weeks", linking the Due for you card (the same rows and count as its "All" tab).
 * Whatever fails to load is left out of the line; the headline itself never fails.
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

  const window = terms.ok
    ? safely("the WebTree window", () => webTreeWindow(terms.value.registration, now))
    : null;
  const windowText = window
    ? safely("the WebTree window", () => webTreeWindowText(window, timeZone))
    : null;
  const { from, to } = dueSoonRange(now);
  const dueForYou = safely("the deadline count", () =>
    dueForYouCount(
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
      title={<span data-testid="today-headline">Your day at Davidson</span>}
      subtitle={
        window && windowText ? (
          <span data-testid="webtree-window">
            {windowText} <span aria-hidden>·</span>{" "}
            <Link href={routes.plan("next")} className={TEXT_LINK} data-testid="plan-next-link">
              Plan {window.termLabel}
            </Link>
          </span>
        ) : dueForYou !== null ? (
          <a href="#due-soon" className={TEXT_LINK} data-testid="due-for-you-line">
            {dueForYou === 0
              ? "Nothing due for you in the next two weeks"
              : `${dueForYou} due for you in the next two weeks`}
          </a>
        ) : undefined
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
