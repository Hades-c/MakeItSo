import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefcaseBusiness } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireFeature } from "@/server/features";

type Params = Promise<{ slug: string }>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const metadata: Metadata = { title: "Career path" };

// Stub (wave 0). Wave 3 replaces this with the career path page (overview, related courses, opportunities,
// verified alumni, AI plan, cold email). Behind FEATURE_CAREERS: keep requireFeature() as the first line (404 while
// the flag is off; the shell hides Careers then).
export default async function CareerPage({ params }: { params: Params }) {
  await requireFeature("careers");
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 80) notFound();

  return (
    <>
      <PageHeader kicker={slug} title="Career path" />
      <EmptyState
        icon={BriefcaseBusiness}
        title="Career path details are coming soon"
        description={
          <p>
            Each career path will list related Davidson courses, opportunities, verified alumni and
            an AI-drafted plan you can move into My plan.
          </p>
        }
        action={
          <Button asChild variant="secondary">
            <Link href="/careers">All careers</Link>
          </Button>
        }
      />
    </>
  );
}
