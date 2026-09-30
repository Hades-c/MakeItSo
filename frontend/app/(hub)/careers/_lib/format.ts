/**
 * Small formatting helpers for the careers and alumni pages (isomorphic, pure).
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** 135980 → "$135,980". */
export function formatUsd(amount: number): string {
  return USD.format(amount);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const MEDIUM_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function dateOnly(day: string): Date | null {
  const match = DATE_ONLY.exec(day);
  if (!match) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : date;
}

/**
 * A content calendar date ("2026-09-30", as `verifiedAt` stores it) → "Sep 30, 2026". The date is a calendar day,
 * not an instant, so it is formatted in UTC and never shifts a day in any time zone. Unparseable text is returned
 * as it is.
 */
export function formatContentDate(day: string): string {
  const date = dateOnly(day);
  return date ? MEDIUM_DATE.format(date) : day;
}

/** "2026-09-30" → "Sep 2026" (when a role was last confirmed). */
export function formatMonthYear(day: string): string {
  const date = dateOnly(day);
  return date ? MONTH_YEAR.format(date) : day;
}

/**
 * A BLS occupation without the content's "( … )" asides, for places with room for a name only (the /careers
 * card): "Securities, commodities, and financial services sales agents (the OOH page describes …)" →
 * "Securities, commodities, and financial services sales agents". The career page shows the full text.
 */
export function occupationName(occupation: string): string {
  const name = occupation
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return name || occupation.trim();
}

/** "1 section" / "3 sections". */
export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A URL without its scheme and "www." ("https://www.davidson.edu/news/x/" → "davidson.edu/news/x"), for source
 * lists where several links go to the same site; the URL itself if it does not parse.
 */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
  } catch {
    return url;
  }
}
