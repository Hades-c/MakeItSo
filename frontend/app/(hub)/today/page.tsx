import type { Metadata } from "next";
import Link from "next/link";
import { House } from "lucide-react";
import { DayHeadline } from "@/components/app/day-headline";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SourceTagList } from "@/components/ui/source-tag";
import { buildDaySummary } from "@/lib/day-summary";
import { requireUser } from "@/server/auth/session";
import { readEnv } from "@/server/env";

export const metadata: Metadata = { title: "Today" };

// Stub (wave 0). Wave 3 builds the real Today hub: day timeline, 5-day strip, due soon, this week on campus,
// degree progress and opportunities, and feeds the real schedule/deadlines/events into buildDaySummary().
export default async function TodayPage() {
  const user = await requireUser();
  const timeZone = readEnv("APP_TIMEZONE");
  const now = new Date();
  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const summary = buildDaySummary({ now, timeZone, hasSchedule: false });

  return (
    <>
      <DayHeadline now={now} timeZone={timeZone} summary={summary} />
      <p className="-mt-2 mb-6 text-sm text-fg-2 md:text-base">Welcome, {firstName}.</p>
      <EmptyState
        icon={House}
        title="Your day will appear here"
        description={
          <>
            <p>
              Once your courses are in MakeItSo, Today shows your class timeline, what is due soon,
              this week on campus and your degree progress.
            </p>
            <p>Every item is labelled with where it came from.</p>
          </>
        }
        action={
          <Button asChild>
            <Link href="/courses">Browse courses</Link>
          </Button>
        }
      >
        <SourceTagList
          label="Sources Today will draw on"
          className="justify-center"
          sources={["course-schedule", "registrar", "my-plan", "wildcatsync"]}
        />
      </EmptyState>
    </>
  );
}
