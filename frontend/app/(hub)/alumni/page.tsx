import type { Metadata } from "next";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireFeature } from "@/server/features";

export const metadata: Metadata = { title: "Alumni" };

// Stub (wave 0). Wave 3 builds the verified alumni directory (signed-in users only). Behind FEATURE_ALUMNI and
// FEATURE_CAREERS (Alumni lives under Careers): keep requireFeature() as the first line (404 while either is off;
// the shell hides Alumni then).
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
