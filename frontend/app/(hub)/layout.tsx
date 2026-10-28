import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { VerifyBanner } from "@/app/(auth)/_components/verify-banner";
import { EVENT_SOURCE_IDS } from "@/app/(hub)/events/_lib/params";
import { AppShell } from "@/components/app/app-shell";
import type { NavCounts } from "@/components/app/sidebar-nav";
import { SourceStatusNotice, type SourceProblem } from "@/components/app/source-status-notice";
import type { Flags } from "@/lib/flags";
import { RETURN_PATH_HEADER, routes } from "@/lib/routes";
import type { SyncedSourceId } from "@/lib/sources";
import { loadAiAllowsUnverified } from "@/server/ai/access";
import { verifyBannerFor, type VerifyBannerState } from "@/server/auth/banner";
import { safeAppPath } from "@/server/auth/paths";
import { isOnboarded, requireUser, type SessionUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { readEnv } from "@/server/env";
import { featureEnabled, hubNavKeys, loadFlags } from "@/server/features";
import { MissingFixtureError } from "@/server/http/fixtures";
import { getPlanCredits } from "@/server/plan";
import { getSourceStatuses } from "@/server/sync";

/**
 * Signed-in shell for every hub page. Server component: resolves the user once per request and passes real data
 * to the Lakeside AppShell. Nothing optional may take the shell down: the sidebar course count and the verify
 * banner each degrade (no count, no banner) and log instead, and so does the source notice (none). Sections whose
 * feature flags are off (Careers,
 * Events, Alumni) leave the sidebar, the bottom tabs and the command palette; their pages answer 404 through
 * requireFeature() (server/features.ts). A malformed flag is logged and takes its default, so it cannot take the
 * shell down either.
 *
 * - Sidebar count: "My plan x/32", the credits done out of the 32 required (server/plan getPlanCredits), left out
 *   when it cannot be computed. Courses has no count: "366" beside Courses under "My plan 8/32" read as 366
 *   courses in the plan.
 * - Source notice: ONE warning above the page naming each source the pages show that is out of date or failing
 *   (server/sync getSourceStatuses: "stale", or "error", including a source that has never synced successfully),
 *   or nothing while all are current. A source with no sync row at all has never been asked for (a fresh
 *   database: feeds sync on their first read), which is not a failure; Events says "not synced yet" itself.
 * - Verify banner: unverified @davidson.edu accounts while mail can be sent (server/auth verifyBannerFor).
 * - First run (PLAN §3): an account that has neither finished nor skipped onboarding (SessionUser.onboardedAt null)
 *   is sent to /onboarding?next=<the page it asked for>, and Skip setup or Finish continues to that page, so a deep
 *   link still arrives. Today (its "Finish setting up" nudge and summary are for exactly these accounts) and Profile
 *   (the same fields) stay open. Like requireUser, this runs when the hub layout renders: on a full page load and
 *   on entering the hub from outside it, not on soft navigations between hub pages (Next keeps the layout), so a
 *   student who chose to leave Today for Courses is not pulled back into setup.
 */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  // requireUser() first: it marks the request dynamic (and redirects signed-out visitors, back to this page via
  // the proxy's return-path header) before any DB read, so nothing here runs at build time.
  const user = await requireUser();
  if (!isOnboarded(user)) {
    const path = await requestedPath();
    if (path && !OPEN_BEFORE_ONBOARDING.has(path.split(/[?#]/)[0] ?? "")) {
      redirect(routes.onboarding(undefined, { next: path }));
    }
  }
  const at = now();
  const flags = loadFlags();
  const [plan, banner, problems] = await Promise.all([
    loadPlanCount(user),
    loadVerifyBanner(user, at),
    loadSourceProblems(at, flags),
  ]);
  const counts: NavCounts = {};
  if (plan !== undefined) counts.plan = plan;
  const nav = hubNavKeys(flags);

  return (
    <AppShell user={{ name: user.name, email: user.email }} nav={nav} counts={counts}>
      {banner ? <VerifyBanner {...banner} aiWithoutVerifying={loadAiAllowsUnverified()} /> : null}
      {problems.length > 0 ? (
        <SourceStatusNotice problems={problems} now={at} timeZone={readEnv("APP_TIMEZONE")} />
      ) : null}
      {children}
    </AppShell>
  );
}

/** Hub pages an account that has not finished onboarding may still open (see the first-run note above). */
const OPEN_BEFORE_ONBOARDING: ReadonlySet<string> = new Set([routes.today(), routes.profile()]);

/**
 * The page this request renders (frontend/proxy.ts RETURN_PATH_HEADER, re-checked with safeAppPath), or null when
 * it is unknown: then nobody is redirected (the header is set on every page request, so this is outside one).
 */
async function requestedPath(): Promise<string | null> {
  const value = (await headers()).get(RETURN_PATH_HEADER);
  return safeAppPath(value, "") || null;
}

/** Log an optional part's failure; a missing test fixture is never hidden. */
function degrade(what: string, error: unknown): undefined {
  if (error instanceof MissingFixtureError) throw error;
  console.error(`[hub] could not load ${what}:`, error);
  return undefined;
}

/** The synced sources some page shows items from (news-only feeds are synced, but no page shows them yet). */
function shownSources(flags: Flags): SyncedSourceId[] {
  return [
    "course-schedule",
    "catalog",
    ...(flags.rmp ? (["ratemyprofessors"] as const) : []),
    ...(featureEnabled(flags, "events") ? EVENT_SOURCE_IDS : []),
  ];
}

async function loadSourceProblems(at: Date, flags: Flags): Promise<SourceProblem[]> {
  try {
    const shown = new Set(shownSources(flags));
    return (await getSourceStatuses(at))
      .filter((row) => shown.has(row.id) && row.status !== "ok")
      .map((row) => ({
        label: row.label,
        status: row.status === "stale" ? "stale" : "error",
        lastSync: row.lastSync,
      }));
  } catch (error) {
    degrade("the source statuses", error);
    return [];
  }
}

async function loadPlanCount(user: SessionUser): Promise<NavCounts["plan"]> {
  try {
    const credits = await getPlanCredits(user.id);
    return { done: credits.done, total: credits.required };
  } catch (error) {
    return degrade("the plan credits", error);
  }
}

async function loadVerifyBanner(user: SessionUser, at: Date): Promise<VerifyBannerState | null> {
  try {
    return await verifyBannerFor(user, at);
  } catch (error) {
    degrade("the verify banner", error);
    return null;
  }
}
