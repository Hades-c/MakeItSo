import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { SignOutButton } from "./_components/sign-out-button";

// Temporary signed-in shell (wave 0). The design-system work replaces this with the Lakeside AppShell.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/today" className="text-lg font-bold tracking-tight">
            MakeItSo
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground" data-testid="hub-user-email">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
