import Link from "next/link";
import { BookOpen, CalendarPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceTag } from "@/components/ui/source-tag";
import { formatTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import { loadProfile, loadTerms, safely, webTreeWindow, type WebTreeWindow } from "@/server/today";

function windowText(window: WebTreeWindow, timeZone: string): string {
  const day = (at: Date) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    }).format(at);
  return `WebTree is open for ${window.termLabel} course preferences until ${day(window.closesAt)} at ${formatTime(window.closesAt, timeZone)}.`;
}

/**
 * The action row under the headline: "Plan Spring 2027" (→ /plan?tab=next, the WebTree list) while WebTree
 * is open (PLAN §3: during the WebTree window only; before it opens Due soon lists the window), with the window's dates from the Registrar calendar; "Browse courses"
 * always; and, while the student has not finished first-run setup, a nudge to /onboarding.
 */
export async function TodayActions({
  userId,
  now,
  timeZone,
}: {
  userId: string;
  now: Date;
  timeZone: string;
}) {
  const [terms, profile] = await Promise.all([loadTerms(), loadProfile(userId)]);
  const window = terms.ok
    ? safely("the WebTree window", () => webTreeWindow(terms.value.registration, now))
    : null;
  const text = window ? safely("the WebTree window", () => windowText(window, timeZone)) : null;
  const needsSetup = profile.ok && profile.value.onboardedAt === null;

  return (
    <div className="mb-5 flex flex-col gap-3">
      {needsSetup ? (
        <section
          aria-labelledby="onboarding-title"
          data-testid="onboarding-nudge"
          className="flex flex-col gap-3 rounded-xl border border-primary bg-primary-wash p-4 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-start gap-3">
            <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <h2 id="onboarding-title" className="text-base font-strong text-fg">
                Finish setting up MakeItSo
              </h2>
              <p className="mt-0.5 text-sm text-fg-2">
                Add your major, your classes this term and the courses you have finished, and Today
                fills in your timeline and degree map.
              </p>
            </div>
          </div>
          <Button asChild>
            {/* No prefetch: the first-run flow is its own app section, loaded only when asked for. */}
            <Link href={routes.onboarding()} prefetch={false}>
              Set up my plan
            </Link>
          </Button>
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5">
        {window ? (
          <Button asChild>
            <Link href={routes.plan("next")} data-testid="plan-next-cta">
              <CalendarPlus aria-hidden />
              Plan {window.termLabel}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link href={routes.courses()}>
            <BookOpen aria-hidden />
            Browse courses
          </Link>
        </Button>
      </div>
      {window && text ? (
        <p
          data-testid="webtree-window"
          data-aggregated={window.source}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2"
        >
          <span>{text}</span>
          <SourceTag source={window.source} />
        </p>
      ) : null}
    </div>
  );
}
