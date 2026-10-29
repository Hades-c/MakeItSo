import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { loadProfile } from "@/server/today";

/**
 * The action row under the headline: while the student has not finished first-run setup, a nudge to /onboarding
 * (PLAN §3). Nothing else: the "Browse courses" and "Plan <term>" buttons are gone (the sidebar and command
 * palette reach Courses and Plan directly; Due for you already lists the WebTree window itself).
 */
export async function TodayActions({ userId }: { userId: string }) {
  const profile = await loadProfile(userId);
  const needsSetup = profile.ok && profile.value.onboardedAt === null;
  if (!needsSetup) return null;

  return (
    <div className="mb-5">
      <section
        aria-labelledby="onboarding-title"
        data-testid="onboarding-nudge"
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex items-start gap-3">
          <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-2" />
          <div>
            <h2 id="onboarding-title" className="text-base font-strong text-fg">
              Finish setting up MakeItSo
            </h2>
            <p className="mt-0.5 text-sm text-fg-2">
              Add your major, your classes this term and the courses you have finished, and Today
              fills in your timeline.
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
    </div>
  );
}
