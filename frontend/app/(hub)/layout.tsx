import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { readEnv } from "@/server/env";
import { hubNavKeys, loadFlags } from "@/server/features";
import { getSourceStatuses, type SourceStatus } from "@/server/sync";

/**
 * Signed-in shell for every hub page. Server component: resolves the user once per request and passes real data
 * to the Lakeside AppShell. The Sources panel lists only sources that have actually synced (server/sync.ts); a
 * failure to read them must never take the shell down, so it degrades to an empty panel. Sections whose feature
 * flags are off (Careers, Events, Alumni) leave the sidebar, the bottom tabs and the command palette; their pages
 * answer 404 through requireFeature() (server/features.ts). A malformed flag is logged and takes its default, so it
 * cannot take the shell down either. Sidebar counts (catalog size, plan credits) and the curated/link sources are
 * wired here as their services land.
 */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  // requireUser() first: it marks the request dynamic (and redirects signed-out visitors) before any DB read, so
  // nothing here runs at build time.
  const user = await requireUser();
  const at = now();
  const sources = await loadSourceStatuses(at);
  const timeZone = readEnv("APP_TIMEZONE");
  const nav = hubNavKeys(loadFlags());

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      nav={nav}
      sources={sources}
      now={at}
      timeZone={timeZone}
    >
      {children}
    </AppShell>
  );
}

async function loadSourceStatuses(at: Date): Promise<SourceStatus[]> {
  try {
    return await getSourceStatuses(at);
  } catch (error) {
    console.error("[hub] could not load source statuses:", error);
    return [];
  }
}
