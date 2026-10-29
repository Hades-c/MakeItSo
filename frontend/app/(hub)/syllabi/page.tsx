import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";
import type { MoodleStatus } from "@/lib/types/moodle";
import { verifyStepFor } from "@/server/auth/banner";
import { requireUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { loadFlags } from "@/server/features";
import { getMoodleStatus, syncMoodleIfDue } from "@/server/moodle";
import { SyllabiBoard } from "./_components/syllabi-board";
import { loadSyllabiPage } from "./_lib/load";

export const metadata: Metadata = { title: "Syllabi" };

/** The Moodle panel's status; null (no panel) when it cannot be read. */
async function loadMoodle(userId: string): Promise<MoodleStatus | null> {
  try {
    return await getMoodleStatus(userId);
  } catch (error) {
    console.error("[syllabi] could not load the Moodle connection:", error);
    return null;
  }
}

/**
 * /syllabi (PLAN-UX §3): connect the student's Moodle calendar (its due dates come in as plan deadlines tagged
 * Moodle, server/moodle), or paste a course syllabus, review the deadlines MakeItSo's AI finds in it, and choose
 * which to add to the plan (lib/types/plan.ts StudentDeadline, origin "syllabus"). The pasted text is never
 * stored; only the course, term, when, and the extracted deadlines are kept (models/Syllabus.ts), reachable again
 * from here to review, replace or delete. A connected Moodle feed last tried 6+ hours ago syncs in the background.
 */
export default async function SyllabiPage() {
  const user = await requireUser();
  const moodleOn = loadFlags().moodle;
  if (moodleOn) await syncMoodleIfDue(user.id);
  const [data, moodle] = await Promise.all([loadSyllabiPage(user.id), loadMoodle(user.id)]);
  const verifyHref = data.gate === "unverified" ? verifyStepFor(user, routes.syllabi()) : null;

  return (
    <>
      <PageHeader
        title="Syllabi"
        subtitle={
          moodleOn
            ? "Bring your class deadlines into your plan: connect Moodle, or paste a syllabus and review what MakeItSo finds."
            : "Paste a syllabus and MakeItSo finds its deadlines for your plan, after you review them."
        }
      />
      <SyllabiBoard
        syllabi={data.syllabi}
        terms={data.terms}
        defaultTerm={data.defaultTerm}
        gate={data.gate}
        unverifiedMessage={data.unverifiedMessage}
        verifyHref={verifyHref}
        moodle={moodle ? { enabled: moodleOn, status: moodle, now: now().toISOString() } : null}
      />
    </>
  );
}
