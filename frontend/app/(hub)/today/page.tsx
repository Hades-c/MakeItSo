import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Today · MakeItSo" };

// Placeholder (wave 0). Wave 3 builds the real Today hub: day timeline, one-sentence day summary, due soon,
// this week on campus (with source tags), degree progress and opportunities.
export default async function TodayPage() {
  const user = await requireUser();
  const firstName = user.name.split(" ")[0] || "there";

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {firstName}</h1>
      <p className="text-muted-foreground">
        MakeItSo is being rebuilt. Your Today page, course catalog and plan are coming back shortly.
      </p>
    </section>
  );
}
