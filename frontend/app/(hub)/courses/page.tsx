import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SourceTagList } from "@/components/ui/source-tag";

export const metadata: Metadata = { title: "Courses" };

// Stub (wave 0). Wave 3 builds catalog search: term selector, filters (department, requirement, days/time,
// open seats, level) and results from the catalog service.
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? "";

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle="Search Davidson's course schedule by department, requirement, meeting time and open seats."
      />
      <EmptyState
        icon={BookOpen}
        title={query ? `Search for “${query}” is coming soon` : "The course catalog is coming soon"}
        description={
          <p>
            You will search every section offered this term and next, straight from the
            Registrar&apos;s public course schedule, with seats, meeting times, instructors and the
            requirements each course fills.
          </p>
        }
      >
        <SourceTagList
          label="Sources for courses"
          className="justify-center"
          sources={["course-schedule", "registrar", "ratemyprofessors"]}
        />
      </EmptyState>
    </>
  );
}
