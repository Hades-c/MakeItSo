import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { VerifyBanner } from "@/app/(auth)/_components/verify-banner";
import { AppShell } from "@/components/app/app-shell";
import type { NavCounts } from "@/components/app/sidebar-nav";
import { RETURN_PATH_HEADER, routes } from "@/lib/routes";
import { loadAiAllowsUnverified } from "@/server/ai/access";
import { verifyBannerFor, type VerifyBannerState } from "@/server/auth/banner";
import { safeAppPath } from "@/server/auth/paths";
import { isOnboarded, requireUser, type SessionUser } from "@/server/auth/session";
import { browseTerm, countCourses } from "@/server/catalog";
import { now } from "@/server/clock";
import { hubNavKeys, loadFlags } from "@/server/features";
import { MissingFixtureError } from "@/server/http/fixtures";
import { getPlanCredits } from "@/server/plan";

/**
 * Signed-in shell for every hub page. Server component: resolves the user once per request and passes real data
 * to the Lakeside AppShell. Nothing optional may take the shell down: the sidebar course count and the verify
 * banner each degrade (no count, no banner) and log instead. Sections whose feature flags are off (Careers,
 * Events, Alumni) leave the sidebar, the bottom tabs and the command palette; their pages answer 404 through
 * requireFeature() (server/features.ts). A malformed flag is logged and takes its default, so it cannot take the
 * shell down either.
 *
 * - Sidebar counts: courses in the term browsing defaults to (server/catalog browseTerm: the registration term once
 *   published, else the current one; on an empty database this is the one synchronous cold load of that term),
 *   and "My plan x/32": the credits done out of the 32 required (server/plan getPlanCredits). Each is left out
 *   when it cannot be computed.
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
  const [courses, plan, banner] = await Promise.all([
    loadCourseCount(at),
    loadPlanCount(user),
    loadVerifyBanner(user, at),
  ]);
  const counts: NavCounts = {};
  if (courses !== undefined) counts.courses = courses;
  if (plan !== undefined) counts.plan = plan;
  const nav = hubNavKeys(loadFlags());

  return (
    <AppShell user={{ name: user.name, email: user.email }} nav={nav} counts={counts}>
      {banner ? <VerifyBanner {...banner} aiWithoutVerifying={loadAiAllowsUnverified()} /> : null}
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

async function loadCourseCount(at: Date): Promise<number | undefined> {
  try {
    return await countCourses(await browseTerm({ now: at }));
  } catch (error) {
    return degrade("the course count", error);
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
