import type { Metadata } from "next";
import { BriefcaseBusiness } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SourceTagList } from "@/components/ui/source-tag";
import { featureMetadata, requireFeature } from "@/server/features";

// Stub (wave 0). Wave 3 builds career paths with related real courses, opportunities, verified alumni and an
// AI career plan (drafts into My plan). Behind FEATURE_CAREERS (404 while it is off; the shell hides Careers then):
// keep featureMetadata() as generateMetadata (a static `metadata` would title the 404 "Careers") and
// requireFeature() as the page's first line.
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("careers", { title: "Careers" });
}

export default async function CareersPage() {
  await requireFeature("careers");
  return (
    <>
      <PageHeader
        title="Careers"
        subtitle="Career paths, the Davidson courses that lead to them, and people and programs that can help."
      />
      <EmptyState
        icon={BriefcaseBusiness}
        title="Career paths are coming soon"
        description={
          <p>
            Explore a career path with the real Davidson courses that relate to it, campus programs,
            links to matching Handshake searches, verified alumni, and an AI-drafted plan you can
            edit.
          </p>
        }
      >
        <SourceTagList
          label="Sources for careers"
          className="justify-center"
          sources={["handshake", "hurt-hub", "course-schedule", "ai"]}
        />
      </EmptyState>
    </>
  );
}
