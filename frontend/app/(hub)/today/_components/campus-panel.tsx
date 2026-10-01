import { ExternalLink } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { formatLongDate, formatTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { FeedItem } from "@/lib/types/feeds";
import { cn } from "@/lib/utils";
import { etDay, loadCampusEvents, pickCampusEvents, safely } from "@/server/today";
import { STRETCHED_LINK } from "../_lib/styles";
import { PanelError } from "./panel-states";

export const CAMPUS_DAYS = 7;
export const CAMPUS_SHOWN = 5;
/** Read more than are shown: long-running items under way are left out (pickCampusEvents). */
export const CAMPUS_FETCHED = 40;

const WEEKDAY = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
const DAY_NUMBER = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone });

/**
 * This week on campus (PLAN §3; R2, rendered only while FEATURE_EVENTS is on): the next campus events from the
 * synced feeds (server/feeds listEvents), each linking to its source page with the tag of its stored source.
 * Long-running items already under way (an application season, an eight-week course) are left out.
 */
export async function CampusPanel({ now, timeZone }: { now: Date; timeZone: string }) {
  const loaded = await loadCampusEvents(now.toISOString(), CAMPUS_DAYS, CAMPUS_FETCHED);
  const events = loaded.ok
    ? safely("this week on campus", () => pickCampusEvents(loaded.value, now, CAMPUS_SHOWN))
    : null;
  if (!events) {
    return <PanelError id="campus" title="This week on campus" what="Campus events" />;
  }
  return (
    <SectionCard
      id="campus"
      title="This week on campus"
      link={{ href: routes.events(), label: "Events" }}
    >
      {events.length === 0 ? (
        <p className="text-sm text-fg-2">Nothing on the campus calendars in the next seven days.</p>
      ) : (
        <ol className="-mt-1 divide-y divide-line">
          {events.map((item) => (
            <CampusRow key={item.id} item={item} now={now} timeZone={timeZone} />
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function CampusRow({ item, now, timeZone }: { item: FeedItem; now: Date; timeZone: string }) {
  const start = item.startsAt ? new Date(item.startsAt) : null;
  // An event already under way (it started before now) shows today's date box.
  const shownDay = start && start.getTime() > now.getTime() ? start : now;
  const isToday = etDay(shownDay) === etDay(now);
  const time = item.allDay
    ? "All day"
    : start && start.getTime() > now.getTime()
      ? formatTime(start, timeZone)
      : "Under way";
  return (
    <li
      data-testid="campus-item"
      data-aggregated={item.source}
      className="relative flex min-h-11 items-start gap-3 py-3"
    >
      <span
        aria-hidden
        className={cn(
          "flex w-11 shrink-0 flex-col items-center rounded-md border py-1",
          isToday
            ? "border-primary-fill bg-primary-fill text-on-primary"
            : "border-line bg-surface-2",
        )}
      >
        <span className="font-mono text-xs leading-4 uppercase">
          {WEEKDAY(timeZone).format(shownDay)}
        </span>
        <span className="text-base leading-5 font-strong">
          {DAY_NUMBER(timeZone).format(shownDay)}
        </span>
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-snug font-semibold text-fg md:text-base">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(STRETCHED_LINK, "hover:text-primary")}
          >
            {item.title} <span className="sr-only">(opens in a new tab)</span>
            <ExternalLink aria-hidden className="inline size-3.5 align-[-0.125em] text-fg-3" />
          </a>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2 md:text-sm">
          <span>
            {isToday ? (
              "Today, "
            ) : (
              <span className="sr-only">{formatLongDate(shownDay, timeZone)}, </span>
            )}
            {time}
            {item.location ? ` · ${item.location}` : ""}
          </span>
          <SourceTag source={item.source} />
        </p>
      </div>
    </li>
  );
}
