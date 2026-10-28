import { SyllabiBoard } from "@/app/(hub)/syllabi/_components/syllabi-board";
import type { SyllabiPageData } from "@/app/(hub)/syllabi/_lib/load";
import { ContinueLink, StepActions } from "./parts";

/**
 * Step 4, syllabi (PLAN-UX §8): the same upload-and-review board as /syllabi (app/(hub)/syllabi), reused as is so
 * a syllabus uploaded here is the same stored upload reachable later from the Syllabi page. Its own mutations
 * (upload, save deadlines, delete) call router.refresh() themselves (useSyllabusAction); nothing here is saved by
 * "Continue" — the step just moves on once the student has uploaded what they want to.
 */

export interface SyllabiStepProps {
  data: SyllabiPageData;
  verifyHref: string | null;
}

export function SyllabiStep({ data, verifyHref }: SyllabiStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <SyllabiBoard
        syllabi={data.syllabi}
        terms={data.terms}
        defaultTerm={data.defaultTerm}
        gate={data.gate}
        unverifiedMessage={data.unverifiedMessage}
        verifyHref={verifyHref}
      />
      <StepActions step="syllabi" primary={<ContinueLink step="syllabi" />} />
    </div>
  );
}
