import Link from "next/link";
import { DayTimeline, type TimelineNextUp } from "@/components/domain/day-timeline";
import { windowLabel } from "@/components/domain/time-geometry";
import { SectionCard } from "@/components/ui/section-card";
import { formatLongDate, formatTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { DaySchedule } from "@/lib/types/plan";
import {
  addDaysToKey,
  audienceIncludes,
  breakOn,
  buildAgenda,
  contentDeadlines,
  etDay,
  loadFeedItems,
  loadPlan,
  loadProfile,
  loadSchedule,
  meetingLocation,
  nextClassDay,
  scheduleTermLabel,
  standingOf,
  loadTerms,
} from "@/server/today";
import { feedRange } from "../_lib/params";
import { TEXT_LINK } from "../_lib/styles";
import { PanelError } from "./panel-states";

export interface TimelinePanelProps {
  userId: string;
  now: Date;
  timeZone: string;
  day: string;
  stripDays: readonly string[];
  eventsOn: boolean;
}

/** "Tomorrow 9:40 AM", "Thu 9:40 AM", "Mon, Oct 5 9:40 AM". */
function nextUpWhen(day: string, from: string, startsAt: string, timeZone: string): string {
  const time = formatTime(startsAt, timeZone);
  if (day === addDaysToKey(from, 1)) return `Tomorrow ${time}`;
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    date,
  );
  return `${weekday} ${time}`;
}

function emptyMessage(schedule: DaySchedule, isToday: boolean, termLabel: string | null): string {
  const when = isToday ? "today" : "that day";
  switch (schedule.empty) {
    case "weekend":
      return "No classes on the weekend.";
    case "break": {
      const name = breakOn(schedule.date)?.name;
      return name ? `No classes ${when}: ${name}.` : `No classes ${when}.`;
    }
    case "no-term":
      return "No term is in session.";
    case "no-sections":
      return termLabel
        ? `No ${termLabel} class sections in your plan yet. Add the sections you take to see them here.`
        : "No class sections in your plan yet. Add the sections you take to see them here.";
    default:
      return `No classes ${when}.`;
  }
}

/**
 * The day timeline card (PLAN §3): classes, the student's and the calendar's timed deadlines and a few campus
 * events for the day shown (today unless ?day= picks another strip day), with the now-line in ET and free gaps,
 * then the first class of the next class day. Sections without a meeting time are listed under it.
 */
export async function TimelinePanel({
  userId,
  now,
  timeZone,
  day,
  stripDays,
  eventsOn,
}: TimelinePanelProps) {
  const today = etDay(now);
  const isToday = day === today;
  const range = feedRange(today, stripDays);
  const [schedule, plan, profile, terms, feeds] = await Promise.all([
    loadSchedule(userId, day),
    loadPlan(userId),
    loadProfile(userId),
    loadTerms(),
    eventsOn ? loadFeedItems(range.from, range.to) : Promise.resolve(null),
  ]);
  const title = isToday ? "Today" : formatLongDate(new Date(`${day}T12:00:00Z`), "UTC");
  if (!schedule.ok) return <PanelError id="timeline" title={title} what="Your schedule" />;

  const standing = standingOf(profile);
  const agenda = buildAgenda({
    day,
    schedule: schedule.value,
    studentDeadlines: plan.ok ? plan.value.deadlines : [],
    contentDeadlines: contentDeadlines(day, day).filter((d) =>
      audienceIncludes(d.audience, standing),
    ),
    feedItems: feeds?.ok ? feeds.value : [],
    ...(isToday ? { now } : {}),
  });
  const next = await nextClassDay(day, (d) => loadSchedule(userId, d));
  const first = next?.schedule.entries[0];
  const nextUp: TimelineNextUp | undefined =
    next && first
      ? {
          code: first.courseCode,
          when: nextUpWhen(next.day, day, first.startsAt, timeZone),
          title: first.title,
          ...(meetingLocation(first) ? { location: meetingLocation(first) } : {}),
        }
      : undefined;
  const termLabel = scheduleTermLabel(schedule, terms);
  const label = `Schedule for ${formatLongDate(new Date(`${day}T12:00:00Z`), "UTC")}`;

  return (
    <SectionCard
      id="timeline"
      title={title}
      count={agenda.items.length > 0 ? windowLabel(agenda.startHour, agenda.endHour) : undefined}
      link={isToday ? undefined : { href: "/today", label: "Back to today" }}
    >
      {agenda.items.length > 0 && schedule.value.empty === "no-sections" ? (
        // Campus events or deadlines fill the view, but the student still needs to add their sections.
        <p data-testid="timeline-empty" className="mb-2 text-sm text-fg-2">
          {emptyMessage(schedule.value, isToday, termLabel)}{" "}
          <Link href={routes.plan("four-year")} className={TEXT_LINK}>
            Open my plan
          </Link>
        </p>
      ) : null}
      {agenda.items.length > 0 ? (
        <DayTimeline
          {...(isToday ? { now } : {})}
          timeZone={timeZone}
          startHour={agenda.startHour}
          endHour={agenda.endHour}
          items={agenda.items}
          showFreeGaps
          label={label}
          {...(nextUp ? { nextUp } : {})}
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <p data-testid="timeline-empty" className="text-sm text-fg-2">
            {emptyMessage(schedule.value, isToday, termLabel)}
          </p>
          {schedule.value.empty === "no-sections" ? (
            <p className="text-sm">
              <Link href={routes.plan("four-year")} className={TEXT_LINK}>
                Open my plan
              </Link>
            </p>
          ) : null}
          {nextUp ? (
            <p className="rounded-md bg-surface-2 px-3 py-2.5 text-sm text-fg-2">
              <b className="font-semibold text-fg">{nextUp.when}</b> · {nextUp.code} {nextUp.title}
              {nextUp.location ? ` · ${nextUp.location}` : null}
            </p>
          ) : null}
        </div>
      )}
      {schedule.value.tba.length > 0 ? (
        <p data-testid="timeline-tba" className="mt-3 text-sm text-fg-2">
          Time TBA: {schedule.value.tba.map((s) => `${s.courseCode} ${s.title}`).join(", ")}
        </p>
      ) : null}
      {eventsOn && agenda.moreEvents > 0 ? (
        <p className="mt-3 text-sm text-fg-2">
          <Link href={routes.events()} className={TEXT_LINK}>
            {agenda.moreEvents} more campus {agenda.moreEvents === 1 ? "event" : "events"}{" "}
            {isToday ? "today" : "that day"}
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}
