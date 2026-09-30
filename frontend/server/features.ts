import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FLAG_ENV_VARS, getFlags, type Flags } from "@/lib/flags";
import { ALL_NAV_KEYS, type NavKey } from "@/lib/nav";
import { EnvError, readEnv } from "@/server/env";

/**
 * Hub sections behind feature flags (PLAN §3, §4.1.14): what the shell shows and which pages exist.
 *
 *   loadFlags()                  getFlags() that never throws: a malformed flag is logged (once) and takes its default
 *   featureEnabled(flags, f)     whether a flagged section is on (Alumni also needs Careers)
 *   hubNavKeys(flags)            the sections the hub layout passes to <AppShell nav>
 *   requireFeature(f)            first line of a flagged page (and its sub-pages): notFound() while the section is off
 *   featureMetadata(f, metadata) a flagged page's generateMetadata, so its 404 is not titled after the hidden section
 *
 * The shell (app/(hub)/layout.tsx) and the pages read the flags the same way, so a section is either in the
 * navigation and reachable, or gone from both. Anything else that leads into a flagged section (a "See all events"
 * link, Today's "This week on campus", the verified alumni on a career page) is shown only while
 * `featureEnabled(loadFlags(), f)` holds, decided on the server; search providers use featureEnabled too. Route
 * handlers keep getFlags(): a bad env fails a route with a 500 (PLAN §2), only the shell and these pages fall back.
 */

/** A nav section with a flag of the same name. */
type FlaggedSection = NavKey & keyof Flags;

/** Hub sections that a feature flag can switch off. Today, Courses and My plan are always there. */
export const HUB_FEATURES = ["careers", "events", "alumni"] as const satisfies FlaggedSection[];
export type HubFeature = (typeof HUB_FEATURES)[number];

function isHubFeature(key: NavKey): key is HubFeature {
  return (HUB_FEATURES as readonly NavKey[]).includes(key);
}

/**
 * Whether a flagged hub section is on. Alumni lives under Careers (the phone tab bar highlights Careers on /alumni,
 * career pages list verified alumni), so it needs FEATURE_CAREERS as well as FEATURE_ALUMNI.
 */
export function featureEnabled(flags: Pick<Flags, HubFeature>, feature: HubFeature): boolean {
  switch (feature) {
    case "careers":
      return flags.careers;
    case "events":
      return flags.events;
    case "alumni":
      return flags.alumni && flags.careers;
  }
}

/** The hub sections to show, in sidebar order: careers off hides Careers (and Alumni), events off hides Events. */
export function hubNavKeys(flags: Pick<Flags, HubFeature>): NavKey[] {
  return ALL_NAV_KEYS.filter((key) => !isHubFeature(key) || featureEnabled(flags, key));
}

/**
 * Warnings this process has already written. The flags come from the deployment's env, so a malformed one is the
 * same on every request: it is reported once, not on every page view and search.
 */
const loggedWarnings = new Set<string>();

/**
 * The current flags, never throwing: a malformed flag (FEATURE_EVENTS=sometimes) must not take the shell or a page
 * down, so it is logged (by name, never its value; each distinct warning once per process) and takes its default,
 * and the well-formed flags keep their values. Route handlers use getFlags() instead, where a bad flag fails loudly.
 */
export function loadFlags(source: Record<string, string | undefined> = process.env): Flags {
  const wellFormed: Record<string, string | undefined> = {};
  const problems: string[] = [];
  for (const name of Object.values(FLAG_ENV_VARS)) {
    try {
      readEnv(name, source);
      wellFormed[name] = source[name];
    } catch (error) {
      // Left unset, so getFlags() below gives it its default.
      problems.push(
        ...(error instanceof EnvError ? error.problems : [`${name} could not be read`]),
      );
    }
  }
  if (problems.length > 0) {
    const warning = `[flags] using the default for malformed feature flags: ${problems.join("; ")}`;
    if (!loggedWarnings.has(warning)) {
      loggedWarnings.add(warning);
      console.error(warning);
    }
  }
  return getFlags(wellFormed);
}

/**
 * For the pages of a flagged hub section (owned by later workstreams): answers 404 (the hub not-found page, inside
 * the shell) while the section is off, so a bookmark or an old link cannot reach a section the shell hides.
 *
 *   export async function generateMetadata(): Promise<Metadata> {
 *     return featureMetadata("events", { title: "Events" });
 *   }
 *
 *   export default async function EventsPage() {
 *     await requireFeature("events");
 *     ...
 *   }
 *
 * Reads the flags per request (it opts the page out of prerendering first), never at build time.
 */
export async function requireFeature(feature: HubFeature): Promise<void> {
  await connection();
  if (!featureEnabled(loadFlags(), feature)) notFound();
}

/**
 * A flagged page's metadata behind the page's own gate: export it as the page's generateMetadata, never a static
 * `metadata` (which Next.js keeps on the 404). While the section is off it answers 404 as well, so the tab and the
 * title screen readers announce come from the not-found page and never name a section the shell hides.
 */
export async function featureMetadata(feature: HubFeature, metadata: Metadata): Promise<Metadata> {
  await requireFeature(feature);
  return metadata;
}
