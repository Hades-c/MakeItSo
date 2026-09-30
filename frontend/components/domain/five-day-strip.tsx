import Link from "next/link";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FiveDayStripDay {
  /** Calendar date in Davidson time, "YYYY-MM-DD" (dayKey from lib/format). */
  date: string;
  /** Short weekday shown on the pill, e.g. "Mon". */
  label: string;
  /** Items that day (classes, deadlines, events); drawn as up to three dots and read out as a number. */
  count: number;
  isToday: boolean;
  /** Opens that day (e.g. /today?day=2026-10-01). Without it the pill is not interactive. */
  href?: string;
  /** The day currently shown, when that is not today. Defaults to today. */
  selected?: boolean;
}

export interface FiveDayStripProps {
  days: readonly FiveDayStripDay[];
  /** Accessible name of the strip (default "This week"). */
  label?: string;
  /** Word for what `count` counts: [singular, plural] (default ["item", "items"]). */
  noun?: readonly [string, string];
  className?: string;
}

const MAX_DOTS = 3;

/** "2026-09-28" → "Monday, September 28" without any time-zone shift (the key already is a Davidson date). */
function longDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : formatLongDate(parsed, "UTC");
}

function dayNumber(date: string): string {
  const day = /^\d{4}-\d{2}-(\d{2})$/.exec(date)?.[1];
  return day ? String(Number(day)) : "";
}

/**
 * The week at a glance (Lakeside Today header): one pill per day with the date and a dot per item, today filled
 * in Lake Blue. Stretches to the full width on phones; every pill is at least 44px tall.
 */
export function FiveDayStrip({
  days,
  label = "This week",
  noun = ["item", "items"],
  className,
}: FiveDayStripProps) {
  const anySelected = days.some((d) => d.selected);
  // A strip of links is navigation; without links it is just a labelled group.
  const Wrapper = days.some((d) => d.href) ? "nav" : "div";
  return (
    <Wrapper
      aria-label={label}
      role={Wrapper === "div" ? "group" : undefined}
      className={className}
    >
      <ol className="flex gap-1.5">
        {days.map((day) => {
          const filled = anySelected ? !!day.selected : day.isToday;
          const count = Math.max(0, Math.floor(day.count));
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "font-mono text-xs leading-4 tracking-label uppercase",
                  filled ? "text-on-primary" : "text-fg-3",
                )}
              >
                {day.label}
              </span>
              <span aria-hidden className="mt-px mb-0.75 text-lg leading-6 font-strong">
                {dayNumber(day.date)}
              </span>
              <span aria-hidden className="flex h-1.25 justify-center gap-0.75">
                {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, i) => (
                  <span
                    key={i}
                    className={cn("size-1.25 rounded-full", filled ? "bg-on-primary" : "bg-line-2")}
                  />
                ))}
              </span>
              <span className="sr-only">
                {longDate(day.date)}: {count} {count === 1 ? noun[0] : noun[1]}
                {day.isToday ? ", today" : ""}
              </span>
            </>
          );
          const box = cn(
            "flex min-h-11 w-full flex-col items-center rounded-lg border px-1 pt-2 pb-2.25 text-center md:w-14.5",
            filled
              ? "border-primary-fill bg-primary-fill text-on-primary"
              : "border-line bg-surface text-fg",
            day.isToday && !filled && "border-primary",
          );
          return (
            <li key={day.date} className="min-w-0 flex-1 md:flex-none">
              {day.href ? (
                <Link
                  href={day.href}
                  aria-current={day.isToday ? "date" : undefined}
                  className={cn(box, !filled && "transition-colors hover:bg-surface-2")}
                >
                  {content}
                </Link>
              ) : (
                <div className={box} aria-current={day.isToday ? "date" : undefined}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Wrapper>
  );
}
