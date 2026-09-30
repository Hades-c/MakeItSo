import type { Metadata } from "next";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { featureMetadata, requireFeature } from "@/server/features";

// Stub (wave 0). Wave 3 builds the verified alumni directory (signed-in users only). Behind FEATURE_ALUMNI and
// FEATURE_CAREERS (Alumni lives under Careers; 404 while either is off, and the shell hides Alumni then): keep
// featureMetadata() as generateMetadata (a static `metadata` would title the 404 "Alumni") and requireFeature() as
// the page's first line.
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("alumni", { title: "Alumni" });
}

export default async function AlumniPage() {
  await requireFeature("alumni");
  return (
    <>
      <PageHeader title="Alumni" subtitle="Davidson alumni you can learn from and reach out to." />
      <EmptyState
        icon={Users}
        title="Verified alumni are coming soon"
        description={
          <p>
            Only alumni whose Davidson degree and LinkedIn profile have both been verified will be
            listed, with the date they were last checked.
          </p>
        }
      />
    </>
  );
}
