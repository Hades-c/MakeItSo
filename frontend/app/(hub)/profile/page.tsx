import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Profile" };

// Stub (wave 0). Wave 1/3 build the profile: major, minor, graduation year, interests, data export, delete account.
export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account and what MakeItSo knows about you." />
      <div className="flex flex-col gap-5">
        <Card asChild>
          <section aria-labelledby="account-title">
            <CardHeader>
              <CardTitle id="account-title">Account</CardTitle>
            </CardHeader>
            <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="font-mono text-xs tracking-label text-fg-3 uppercase md:pt-0.5">
                Name
              </dt>
              <dd className="min-w-0 break-words text-fg">{user.name || "Not set"}</dd>
              <dt className="font-mono text-xs tracking-label text-fg-3 uppercase md:pt-0.5">
                Email
              </dt>
              <dd className="min-w-0 break-words text-fg">{user.email}</dd>
            </dl>
          </section>
        </Card>
        <EmptyState
          icon={UserRound}
          title="Profile settings are coming soon"
          description={
            <p>
              Set your major, minor, graduation year and interests, export your data, or delete your
              account.
            </p>
          }
        />
      </div>
    </>
  );
}
