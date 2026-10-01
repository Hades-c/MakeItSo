import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { controlClass, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { routes } from "@/lib/routes";
import type { TermCode } from "@/lib/term";
import type { CatalogFilters, CatalogQuery } from "@/lib/types/catalog";
import { cn } from "@/lib/utils";
import {
  coursesHref,
  DAY_OPTIONS,
  hasFilters,
  LEVEL_OPTIONS,
  TIME_OPTIONS,
  timeLabel,
} from "../_lib/query";
import type { TermOption } from "../_lib/search";
import { CleanGetForm } from "./clean-get-form";

/**
 * /courses search and filters (PLAN §3, §7 "State"): one GET form, so every choice lands in the URL and back,
 * reload and shared links reproduce the search; it works without JavaScript. Text, term, department,
 * requirement, the days the student is free, a time window, open seats only and level. Active filters are listed
 * as links that remove one filter each.
 *
 * The department and requirement selects pick one value; a URL with several (?dept=CSC&dept=MAT, from a shared
 * link) keeps the others as hidden fields, listed under "Active filters" where each can be removed.
 */

const SELECT = cn(controlClass, "h-11 px-3 md:h-10");
const CHECK =
  "size-4.5 shrink-0 rounded-xs border-line-strong accent-primary-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const CHECK_LABEL =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg md:min-h-9";

export interface ActiveFilter {
  key: string;
  label: string;
  href: string;
}

/** Each active filter with the link that removes it (pure; exported for tests). */
export function activeFilters(
  query: CatalogQuery,
  term: TermCode,
  names: { dept: ReadonlyMap<string, string>; req: ReadonlyMap<string, string> },
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  const without = <K extends "dept" | "req" | "days" | "level">(key: K, value: string) =>
    coursesHref(query, term, {
      [key]: (query[key] as readonly string[]).filter((v) => v !== value),
    });
  if (query.q)
    out.push({ key: "q", label: `“${query.q}”`, href: coursesHref(query, term, { q: "" }) });
  for (const dept of query.dept) {
    out.push({
      key: `dept-${dept}`,
      label: names.dept.get(dept) ?? dept,
      href: without("dept", dept),
    });
  }
  for (const req of query.req) {
    out.push({ key: `req-${req}`, label: names.req.get(req) ?? req, href: without("req", req) });
  }
  if (query.days.length > 0) {
    const days = DAY_OPTIONS.filter((d) => query.days.includes(d.value)).map((d) => d.short);
    out.push({
      key: "days",
      label: `Only ${days.join(", ")}`,
      href: coursesHref(query, term, { days: [] }),
    });
  }
  if (query.after) {
    out.push({
      key: "after",
      label: `Starts ${timeLabel(query.after)} or later`,
      href: coursesHref(query, term, { after: undefined }),
    });
  }
  if (query.before) {
    out.push({
      key: "before",
      label: `Ends by ${timeLabel(query.before)}`,
      href: coursesHref(query, term, { before: undefined }),
    });
  }
  if (query.openOnly) {
    out.push({
      key: "openOnly",
      label: "Open seats",
      href: coursesHref(query, term, { openOnly: false }),
    });
  }
  for (const level of query.level) {
    out.push({ key: `level-${level}`, label: `${level}-level`, href: without("level", level) });
  }
  return out;
}

export function CourseFilters({
  query,
  term,
  termOptions,
  filters,
}: {
  query: CatalogQuery;
  term: TermCode;
  termOptions: readonly TermOption[];
  filters: CatalogFilters | null;
}) {
  const deptNames = new Map(filters?.departments.map((d) => [d.code, d.name]) ?? []);
  const reqNames = new Map(filters?.requirements.map((r) => [r.code, r.name]) ?? []);
  const active = activeFilters(query, term, { dept: deptNames, req: reqNames });
  const advanced = active.filter((filter) => filter.key !== "q").length;
  const [dept, ...extraDepts] = query.dept;
  const [req, ...extraReqs] = query.req;
  // Keyed on the URL: after a client-side navigation the form shows the URL's state, not stale typing.
  const formKey = coursesHref(query, term);

  return (
    <div className="mb-5 flex flex-col gap-3">
      <CleanGetForm
        key={formKey}
        action={routes.courses()}
        autoComplete="off"
        aria-label="Course search"
        className="rounded-xl border border-line bg-surface p-4 shadow-card"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] md:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="courses-q">Search the schedule</Label>
            <Input
              id="courses-q"
              name="q"
              type="search"
              defaultValue={query.q}
              maxLength={100}
              placeholder="Code, title, instructor or topic"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="courses-term">Term</Label>
            <select
              id="courses-term"
              name="term"
              defaultValue={term}
              autoComplete="off"
              className={SELECT}
            >
              {termOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">
            <Search aria-hidden />
            Search
          </Button>
        </div>

        <details className="group mt-3" open={advanced > 0 || undefined}>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-semibold text-primary md:min-h-9 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden className="size-4" />
            Filters
            {advanced > 0 ? (
              <span className="font-mono text-xs text-fg-2">{advanced} active</span>
            ) : null}
          </summary>
          <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="courses-dept">Department</Label>
              <select
                id="courses-dept"
                name="dept"
                defaultValue={dept ?? ""}
                autoComplete="off"
                className={SELECT}
              >
                <option value="">All departments</option>
                {(filters?.departments ?? []).map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name} ({option.code})
                  </option>
                ))}
              </select>
              {extraDepts.map((value) => (
                <input key={value} type="hidden" name="dept" value={value} />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="courses-req">Requirement</Label>
              <select
                id="courses-req"
                name="req"
                defaultValue={req ?? ""}
                autoComplete="off"
                className={SELECT}
              >
                <option value="">Any requirement</option>
                {(filters?.requirements ?? []).map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name} ({option.code})
                  </option>
                ))}
              </select>
              {extraReqs.map((value) => (
                <input key={value} type="hidden" name="req" value={value} />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="courses-after">Starts at or after</Label>
              <select
                id="courses-after"
                name="after"
                defaultValue={query.after ?? ""}
                autoComplete="off"
                className={SELECT}
              >
                <option value="">Any time</option>
                {TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="courses-before">Ends by</Label>
              <select
                id="courses-before"
                name="before"
                defaultValue={query.before ?? ""}
                autoComplete="off"
                className={SELECT}
              >
                <option value="">Any time</option>
                {TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="md:col-span-2">
              <legend className="mb-1.5 text-sm font-semibold text-fg">
                Only on days I’m free
              </legend>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((day) => (
                  <label key={day.value} className={CHECK_LABEL}>
                    <input
                      type="checkbox"
                      name="days"
                      value={day.value}
                      defaultChecked={query.days.includes(day.value)}
                      className={CHECK}
                    />
                    <span aria-hidden>{day.short}</span>
                    <span className="sr-only">{day.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-fg">Level</legend>
              <div className="flex flex-wrap gap-2">
                {LEVEL_OPTIONS.map((level) => (
                  <label key={level.value} className={CHECK_LABEL}>
                    <input
                      type="checkbox"
                      name="level"
                      value={level.value}
                      defaultChecked={query.level.includes(level.value)}
                      className={CHECK}
                    />
                    {level.value}
                    <span className="sr-only">-level</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-fg">Seats</legend>
              <label className={CHECK_LABEL}>
                <input
                  type="checkbox"
                  name="openOnly"
                  value="true"
                  defaultChecked={query.openOnly}
                  className={CHECK}
                />
                Open seats only
              </label>
            </fieldset>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit">Apply filters</Button>
          </div>
        </details>
      </CleanGetForm>

      {active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="active-filters">
          <span className="text-sm text-fg-2">Active filters:</span>
          <ul className="flex flex-wrap gap-2">
            {active.map((filter) => (
              <li key={filter.key}>
                <Link
                  href={filter.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary bg-primary-wash px-3 text-sm font-medium text-primary hover:underline md:min-h-8"
                >
                  {filter.label}
                  <X aria-hidden className="size-3.5" />
                  <span className="sr-only">(remove filter)</span>
                </Link>
              </li>
            ))}
          </ul>
          {hasFilters(query) ? (
            <Link
              href={routes.courses({ term })}
              className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-semibold text-primary hover:underline md:min-h-8"
            >
              Clear all
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
