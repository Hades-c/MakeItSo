import * as z from "zod";
import { routes } from "@/lib/routes";
import { IsoDateSchema } from "@/lib/types/common";

/**
 * /today search params (PLAN §7: view state lives in the URL). `?day=YYYY-MM-DD` shows another day of the
 * five-day strip on the timeline; any other value (or a day outside the strip) shows today. The headline always
 * sums up today.
 */

export type TodaySearchParams = Record<string, string | string[] | undefined>;

const DayParamSchema = IsoDateSchema;

/** The day the timeline shows: `?day=` when it is one of the strip's days, else today. */
export function parseDayParam(
  params: TodaySearchParams,
  today: string,
  stripDays: readonly string[],
): string {
  const raw = params.day;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const parsed = z.string().pipe(DayParamSchema).safeParse(first);
  if (!parsed.success) return today;
  return parsed.data === today || stripDays.includes(parsed.data) ? parsed.data : today;
}

/** The strip's link for a day: /today for today (a clean URL), /today?day=… for the others. */
export function todayHref(day: string, today: string): string {
  return routes.today(day === today ? {} : { day });
}

/** The Davidson days the feeds are read for once per request: the strip's days and today. */
export function feedRange(
  today: string,
  stripDays: readonly string[],
): { from: string; to: string } {
  const days = [today, ...stripDays].sort();
  return { from: days[0] ?? today, to: days[days.length - 1] ?? today };
}
