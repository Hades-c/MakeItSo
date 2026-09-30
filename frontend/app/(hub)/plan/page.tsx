import type { Metadata } from "next";
import { Map as MapIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SourceTagList } from "@/components/ui/source-tag";

export const metadata: Metadata = { title: "My plan" };

// Stub (wave 0). Wave 2 builds the plan: next semester (week grid + conflicts), 4-year plan with the requirements
// tracker, AI suggestions as drafts, and summer.
export default function PlanPage() {
  return (
    <>
      <PageHeader
        title="My plan"
        subtitle="Next semester, your four-year plan and suggestions, in one place."
      />
      <EmptyState
        icon={MapIcon}
        title="Your plan will live here"
        description={
          <>
            <p>
              Record the courses you have taken, plan future terms and track progress toward the 32
              credits Davidson requires, along with Writing, the Ways of Knowing, Cultural
              Diversity, Justice, Equality, and Community, and the language requirement.
            </p>
            <p>Always confirm your progress in Degree Works.</p>
          </>
        }
      >
        <SourceTagList
          label="Sources for your plan"
          className="justify-center"
          sources={["my-plan", "course-schedule", "registrar"]}
        />
      </EmptyState>
    </>
  );
}
