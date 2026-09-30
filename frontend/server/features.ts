import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ALL_NAV_KEYS, type NavKey } from "@/components/app/nav-items";
import { FLAG_ENV_VARS, getFlags, type Flags } from "@/lib/flags";
import { EnvError, readEnv } from "@/server/env";

/**
 * Hub sections behind feature flags (PLAN §3, §4.1.14): what the shell shows and which pages exist.
 *
 *   loadFlags()               getFlags() that never throws: a malformed flag is logged and takes its default
 *   featureEnabled(flags, f)  whether a flagged section is on (Alumni also needs Careers)
 *   hubNavKeys(flags)         the sections the hub layout passes to <AppShell nav>
 *   requireFeature(f)         first line of a flagged page (and its sub-pages): notFound() while the section is off
 *
 * The shell (app/(hub)/layout.tsx) and the pages read the flags the same way, so a section is either in the
 * navigation and reachable, or gone from both. Search providers respect the same rule (`featureEnabled`).
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
 * The current flags, never throwing: a malformed flag (FEATURE_EVENTS=sometimes) must not take the shell or a page
 * down, so it is logged (by name, never its value) and takes its default, and the well-formed flags keep their
 * values. Use getFlags() where a bad flag should fail loudly instead.
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
    console.error(`[flags] using the default for malformed feature flags: ${problems.join("; ")}`);
  }
  return getFlags(wellFormed);
}

/**
 * For the pages of a flagged hub section (owned by later workstreams): answers 404 (the hub not-found page, inside
 * the shell) while the section is off, so a bookmark or an old link cannot reach a section the shell hides.
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
