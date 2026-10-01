import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";
import { isTermCode, type TermCode } from "@/lib/term";

/**
 * Typed href builders and parsers for every page (PLAN §3). Build links only with these, so a route change is one
 * edit. Tabs, filters and the term live in URL search params (PLAN §7 "State"), named like the matching API query
 * schemas (CatalogQuerySchema, EventsQuerySchema) so a page can parse its searchParams with them. Isomorphic.
 *
 *   routes.course("202602", "CSC 221")   → "/courses/202602/CSC-221"
 *   routes.courses({ term: "202602", q: "data", dept: ["CSC", "MAT"] }) → "/courses?term=202602&q=data&dept=CSC&dept=MAT"
 *   routes.plan("next")                  → "/plan?tab=next"
 *   routes.career("software-engineering") → "/careers/software-engineering"
 */

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

/** "?a=1&b=x&b=y" from an object; undefined, null, "", false and [] are left out. Keys keep insertion order. */
export function queryString(params: Readonly<Record<string, QueryValue>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// ---- Course slugs ------------------------------------------------------------------------------------------------

/** URL form of a course code: "CSC 221" → "CSC-221". */
export function courseSlug(code: string): string {
  return normalizeCourseCode(code).replace(" ", "-");
}

/** "CSC-221" / "csc-221" / "CSC%20221" → "CSC 221"; null when it is not a course code. */
export function parseCourseSlug(slug: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const code = normalizeCourseCode(decoded.replace(/-/g, " "));
  return COURSE_CODE_PATTERN.test(code) ? code : null;
}

// ---- Tabs --------------------------------------------------------------------------------------------------------

/** /plan tabs: Next semester (WebTree list), 4-year plan, Suggestions (AI, R2), Summer. */
export const PLAN_TABS = ["next", "four-year", "suggestions", "summer"] as const;
export type PlanTab = (typeof PLAN_TABS)[number];
export const DEFAULT_PLAN_TAB: PlanTab = "next";

export function parsePlanTab(value: string | string[] | null | undefined): PlanTab {
  const first = Array.isArray(value) ? value[0] : value;
  return (PLAN_TABS as readonly string[]).includes(first ?? "")
    ? (first as PlanTab)
    : DEFAULT_PLAN_TAB;
}

/** /onboarding steps (PLAN §3: the first run, in four skippable steps; the step lives in `?step=`). */
export const ONBOARDING_STEPS = ["about", "classes", "completed", "interests"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The step a `?step=` search param names, or null (missing, repeated or unknown). */
export function parseOnboardingStep(
  value: string | string[] | null | undefined,
): OnboardingStep | null {
  const first = Array.isArray(value) ? value[0] : value;
  return (ONBOARDING_STEPS as readonly string[]).includes(first ?? "")
    ? (first as OnboardingStep)
    : null;
}

/** A term code from a search param, or null (callers then use the registration term). */
export function parseTermParam(value: string | string[] | null | undefined): TermCode | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first && isTermCode(first) ? first : null;
}

// ---- Callback URLs -----------------------------------------------------------------------------------------------

/**
 * Request header the request proxy (frontend/proxy.ts) sets on every page request (every path but /api, /_next and
 * the files in public/, dotted paths included) to the requested path + query, so layouts, which cannot see the
 * URL, can send a signed-out deep link to /login?callbackUrl=<path> (server/auth/session.ts requireUser). Always
 * overwritten (`set`, never `append`); still untrusted input: re-checked with safeAppPath before use.
 */
export const RETURN_PATH_HEADER = "x-mis-return-path";

/** The RETURN_PATH_HEADER value for a requested URL: "/plan?tab=four-year" (Next's internal `_rsc` dropped). */
export function returnPathOf(url: URL): string {
  const search = new URLSearchParams(url.search);
  search.delete("_rsc");
  const query = search.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

/**
 * A same-origin path to return to after sign-in (PLAN §3: login honours a same-origin callbackUrl). Accepts an app
 * path ("/plan?tab=next") or an absolute URL on `origin`; anything else (other hosts, "//evil", "javascript:")
 * gives `fallback`. The check runs on the raw value AND on the normalised path it returns: dot segments collapse
 * into a protocol-relative path ("/.//evil", "/..//evil", "/a/..//evil", "/%2e//evil" all normalise to "//evil"),
 * so a result never starts with "//" or "/\".
 */
export function safeCallbackPath(
  value: string | null | undefined,
  origin: string,
  fallback = "/today",
): string {
  if (!value) return fallback;
  try {
    const base = new URL(origin);
    const url = new URL(value, base);
    if (url.origin !== base.origin) return fallback;
    if (!value.startsWith("/") && !value.startsWith(base.origin)) return fallback;
    if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!/^\/(?![/\\])/.test(path)) return fallback;
    return path.startsWith("/login") || path.startsWith("/register") ? fallback : path;
  } catch {
    return fallback;
  }
}

// ---- Builders ----------------------------------------------------------------------------------------------------

export interface CoursesParams {
  term?: TermCode;
  q?: string;
  dept?: readonly string[];
  req?: readonly string[];
  days?: readonly string[];
  after?: string;
  before?: string;
  openOnly?: boolean;
  level?: readonly string[];
  page?: number;
}

export interface EventsParams {
  sources?: readonly string[];
  kinds?: readonly string[];
  q?: string;
}

export const routes = {
  home: () => "/",
  login: (callbackUrl?: string) => `/login${queryString({ callbackUrl })}`,
  register: () => "/register",
  verify: () => "/verify",
  forgotPassword: () => "/forgot-password",
  privacy: () => "/privacy",
  /**
   * /onboarding, at `step` (none: resume where the student stopped). `next` is the page to continue to once setup
   * is finished or skipped (the hub sends first-run deep links here with it); the page re-checks it with
   * safeAppPath, so pass any same-origin path.
   */
  onboarding: (step?: OnboardingStep, params: { next?: string } = {}) =>
    `/onboarding${queryString({ step, next: params.next })}`,
  /** /today, or another day of the five-day strip (`day` = YYYY-MM-DD; the page ignores days off the strip). */
  today: (params: { day?: string } = {}) => `/today${queryString({ day: params.day })}`,
  courses: (params: CoursesParams = {}) =>
    `/courses${queryString({
      term: params.term,
      q: params.q?.trim(),
      dept: params.dept,
      req: params.req,
      days: params.days,
      after: params.after,
      before: params.before,
      openOnly: params.openOnly ? "true" : undefined,
      level: params.level,
      page: params.page && params.page > 1 ? params.page : undefined,
    })}`,
  course: (term: TermCode, code: string) => `/courses/${term}/${courseSlug(code)}`,
  /** /plan at `tab`; `term` = a later WebTree term; `view: "print"` = the WebTree print view (Next semester tab). */
  plan: (tab?: PlanTab, params: { term?: TermCode; view?: "print" } = {}) =>
    `/plan${queryString({ tab, term: params.term, view: params.view })}`,
  careers: () => "/careers",
  career: (slug: string) => `/careers/${encodeURIComponent(slug)}`,
  events: (params: EventsParams = {}) =>
    `/events${queryString({ sources: params.sources, kinds: params.kinds, q: params.q?.trim() })}`,
  alumni: (params: { career?: string } = {}) => `/alumni${queryString({ career: params.career })}`,
  /** One alumnus's card in the directory: /alumni#<id> (the card's element id is the Alumnus id). */
  alumnus: (id: string) => `/alumni#${encodeURIComponent(id)}`,
  profile: () => "/profile",
} as const;

export type AppRoutes = typeof routes;
