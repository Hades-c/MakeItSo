import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/server/auth/session";
import { readEnv } from "@/server/env";

/**
 * Signed-in shell for every hub page. Server component: resolves the user once per request and passes real data
 * to the Lakeside AppShell. Later waves add the sidebar counts (catalog size, plan progress) and the Sources panel
 * entries (feed name + last sync) here; until a source is actually synced it is not listed.
 */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const timeZone = readEnv("APP_TIMEZONE");

  return (
    <AppShell user={{ name: user.name, email: user.email }} now={new Date()} timeZone={timeZone}>
      {children}
    </AppShell>
  );
}
