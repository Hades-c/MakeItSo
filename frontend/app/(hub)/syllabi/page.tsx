import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";
import { verifyStepFor } from "@/server/auth/banner";
import { requireUser } from "@/server/auth/session";
import { SyllabiBoard } from "./_components/syllabi-board";
import { loadSyllabiPage } from "./_lib/load";

export const metadata: Metadata = { title: "Syllabi" };

/**
 * /syllabi (PLAN-UX §3): upload a course syllabus, review the deadlines MakeItSo's AI finds in it, and choose
 * which to add to the plan (lib/types/plan.ts StudentDeadline, origin "syllabus"). The file itself is never
 * stored (server/syllabi/extract.ts reads it once); only the course, term, filename, upload time and extracted
 * deadlines are kept (models/Syllabus.ts), reachable again from here to review, replace or delete.
 */
export default async function SyllabiPage() {
  const user = await requireUser();
  const data = await loadSyllabiPage(user.id);
  const verifyHref = data.gate === "unverified" ? verifyStepFor(user, routes.syllabi()) : null;

  return (
    <>
      <PageHeader
        title="Syllabi"
        subtitle="Upload a syllabus and MakeItSo pulls its deadlines into your plan, after you review them."
      />
      <SyllabiBoard
        syllabi={data.syllabi}
        terms={data.terms}
        defaultTerm={data.defaultTerm}
        gate={data.gate}
        unverifiedMessage={data.unverifiedMessage}
        verifyHref={verifyHref}
      />
    </>
  );
}
