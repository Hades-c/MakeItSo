import { VerifyBanner } from "@/app/(auth)/_components/verify-banner";
import { AppShell } from "@/components/app/app-shell";
import type { SourceLink, SourceSync } from "@/components/app/sources-panel";
import { sourcesOfKind } from "@/lib/sources";
import { verifyBannerFor, type VerifyBannerState } from "@/server/auth/banner";
import { requireUser, type SessionUser } from "@/server/auth/session";
import { browseTerm, countCourses } from "@/server/catalog";
import { now } from "@/server/clock";
import { curatedSourceVerifiedAt, type CuratedSourceId } from "@/server/content";
import { linkForSource } from "@/server/content/links";
import { readEnv } from "@/server/env";
import { hubNavKeys, loadFlags } from "@/server/features";
import { MissingFixtureError } from "@/server/http/fixtures";
import { getSourceStatuses, type SourceStatus } from "@/server/sync";

/**
 * Signed-in shell for every hub page. Server component: resolves the user once per request and passes real data
 * to the Lakeside AppShell. Nothing optional may take the shell down: the Sources panel, the sidebar course count
 * and the verify banner each degrade (empty panel, no count, no banner) and log instead. Sections whose feature
 * flags are off (Careers, Events, Alumni) leave the sidebar, the bottom tabs and the command palette; their pages
 * answer 404 through requireFeature() (server/features.ts). A malformed flag is logged and takes its default, so it
 * cannot take the shell down either.
 *
 * - Sources panel: the synced sources with their real last sync (server/sync.ts), then the curated sources with
 *   the date their content was last verified (server/content curatedSourceVerifiedAt), and under "Links" the
 *   platforms MakeItSo only links to (Handshake, Davidson One, Athletics: the curated links that carry the tag).
 * - Sidebar count: courses in the term browsing defaults to (server/catalog browseTerm: the registration term once
 *   published, else the current one). On an empty database this is the one synchronous cold load of that term.
 *   Plan credits join when server/plan lands (W5s).
 * - Verify banner: unverified @davidson.edu accounts while mail can be sent (server/auth verifyBannerFor).
 */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  // requireUser() first: it marks the request dynamic (and redirects signed-out visitors, back to this page via
  // the proxy's return-path header) before any DB read, so nothing here runs at build time.
  const user = await requireUser();
  const at = now();
  const [synced, courses, banner] = await Promise.all([
    loadSourceStatuses(at),
    loadCourseCount(at),
    loadVerifyBanner(user, at),
  ]);
  const timeZone = readEnv("APP_TIMEZONE");
  const nav = hubNavKeys(loadFlags());

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      nav={nav}
      counts={courses === undefined ? {} : { courses }}
      sources={[...synced, ...curatedSources()]}
      links={portalLinks()}
      now={at}
      timeZone={timeZone}
    >
      {banner ? <VerifyBanner {...banner} /> : null}
      {children}
    </AppShell>
  );
}

/** Log an optional part's failure; a missing test fixture is never hidden. */
function degrade(what: string, error: unknown): undefined {
  if (error instanceof MissingFixtureError) throw error;
  console.error(`[hub] could not load ${what}:`, error);
  return undefined;
}

async function loadSourceStatuses(at: Date): Promise<SourceStatus[]> {
  try {
    return await getSourceStatuses(at);
  } catch (error) {
    degrade("source statuses", error);
    return [];
  }
}

async function loadCourseCount(at: Date): Promise<number | undefined> {
  try {
    return await countCourses(await browseTerm({ now: at }));
  } catch (error) {
    return degrade("the course count", error);
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

/** Curated sources with the date their content was last verified; a source no content carries is left out. */
function curatedSources(): SourceSync[] {
  const rows: SourceSync[] = [];
  for (const source of sourcesOfKind("curated")) {
    const verifiedAt = curatedSourceVerifiedAt(source.id as CuratedSourceId);
    if (verifiedAt) rows.push({ id: source.id, verifiedAt });
  }
  return rows;
}

/** The link-only platforms, each at its curated link (PLAN §5: those tags appear only on curated deep links). */
function portalLinks(): SourceLink[] {
  const links: SourceLink[] = [];
  for (const source of sourcesOfKind("link")) {
    const link = linkForSource(source.id as Parameters<typeof linkForSource>[0]);
    if (link) links.push({ id: source.id, href: link.url });
  }
  return links;
}
