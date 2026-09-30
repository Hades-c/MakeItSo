import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { AiChip } from "@/components/ui/ai-chip";
import { CourseCode } from "@/components/ui/course-code";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SourceTagList } from "@/components/ui/source-tag";
import { parseTermCode } from "@/lib/term";

type Params = Promise<{ term: string; code: string }>;

/** URL form of a course code: "CSC-221" (department, hyphen, number, optional suffix letter). */
const COURSE_SLUG = /^([A-Za-z]{2,5})-(\d{3}[A-Za-z]?)$/;

function parse(term: string, code: string) {
  const parsedTerm = parseTermCode(term);
  const match = COURSE_SLUG.exec(decodeURIComponent(code));
  if (!parsedTerm || !match?.[1] || !match[2]) return null;
  return { term: parsedTerm, code: `${match[1].toUpperCase()} ${match[2].toUpperCase()}` };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { term, code } = await params;
  const parsed = parse(term, code);
  return { title: parsed ? `${parsed.code} · ${parsed.term.label}` : "Course" };
}

// Stub (wave 0). Wave 3 builds the course page: index-card header, sections with seats and meeting times,
// instructors with ratings, official prerequisites, requirement slots, week-grid conflict check, Add to plan.
export default async function CoursePage({ params }: { params: Params }) {
  const { term, code } = await params;
  const parsed = parse(term, code);
  if (!parsed) notFound();

  return (
    <>
      <PageHeader
        kicker={parsed.term.label}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <CourseCode code={parsed.code} variant="chip" size="md" />
            <span>Course details</span>
          </span>
        }
      />
      <EmptyState
        icon={BookOpen}
        title="Course details are coming soon"
        description={
          <>
            <p>
              This page will show every section of {parsed.code} in {parsed.term.label}: seats,
              meeting times and rooms, instructors with their ratings, the official prerequisites
              and the requirements it fills.
            </p>
            <p>AI summaries will be marked like this:</p>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4">
          <AiChip />
          <SourceTagList
            label="Sources for course details"
            className="justify-center"
            sources={["course-schedule", "registrar", "ratemyprofessors", "ai"]}
          />
        </div>
      </EmptyState>
    </>
  );
}
