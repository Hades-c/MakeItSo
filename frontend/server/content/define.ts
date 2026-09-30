import "server-only";
import { z } from "zod";
import { dayKey, DEFAULT_TIME_ZONE } from "@/lib/format";

/**
 * Helpers shared by the curated content modules (server/content/*). Every module is a hand-checked, sourced list
 * converted from the verified research (PLAN §6.1 W4b); nothing here reads the network or the database.
 */

/** Deep-freeze a parsed record so a consumer can never edit the shared copy. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Validate a content list against its strict schema at module load, check that `key` is unique, and freeze it.
 * A bad record fails loudly (with the module name) in tests and the build instead of rendering wrong facts.
 */
export function defineContent<S extends z.ZodType>(
  name: string,
  schema: S,
  records: readonly z.input<S>[],
  key: (record: z.output<S>) => string,
): readonly z.output<S>[] {
  const parsed = z.array(schema).safeParse(records);
  if (!parsed.success) {
    throw new Error(`server/content/${name}: invalid record\n${z.prettifyError(parsed.error)}`);
  }
  const seen = new Set<string>();
  for (const record of parsed.data) {
    const id = key(record);
    if (seen.has(id)) throw new Error(`server/content/${name}: duplicate key "${id}"`);
    seen.add(id);
  }
  return deepFreeze(parsed.data);
}

/** Validate and freeze one content object (e.g. the Handshake config or the graduation rules). */
export function defineContentObject<S extends z.ZodType>(
  name: string,
  schema: S,
  record: z.input<S>,
): z.output<S> {
  const parsed = schema.safeParse(record);
  if (!parsed.success) {
    throw new Error(`server/content/${name}: invalid record\n${z.prettifyError(parsed.error)}`);
  }
  return deepFreeze(parsed.data);
}

/** The latest `verifiedAt` of a list ("YYYY-MM-DD" compares as text). */
export function latestVerifiedAt(records: readonly { verifiedAt: string }[]): string {
  return records.reduce((latest, r) => (r.verifiedAt > latest ? r.verifiedAt : latest), "");
}

// ---- Davidson calendar days ----------------------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A moment (server `now()`) or a Davidson calendar date ("2026-10-12"). */
export type DayInput = Date | string;

/**
 * The America/New_York calendar day of `value` as "YYYY-MM-DD". Content dates are Davidson calendar dates, so the
 * zone is always Davidson's, whatever the server's own zone. A "YYYY-MM-DD" string is taken as that day.
 */
export function davidsonDay(value: DayInput): string {
  if (typeof value === "string" && ISO_DATE.test(value)) {
    // Round-trip: V8 would otherwise accept "2026-02-30" as March 2.
    const ms = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
      throw new RangeError(`Invalid date: ${value}`);
    }
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return dayKey(date, DEFAULT_TIME_ZONE);
}

/** "2026-10-30" + 3 → "2026-11-02" (calendar arithmetic on dates, no time zone involved). */
export function addDays(day: string, days: number): string {
  const ms = Date.parse(`${davidsonDay(day)}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---- Text ----------------------------------------------------------------------------------------------------------

/**
 * Fold text for matching (search providers over content): NFKD, accents stripped, lower case, "&" read as "and",
 * whitespace collapsed ("Tomás" → "tomas", "UX & Interaction" → "ux and interaction").
 */
export function foldText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}
