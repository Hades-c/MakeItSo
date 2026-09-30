import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { featureMetadata, requireFeature } from "@/server/features";
import type { SearchParamsRecord } from "@/app/(hub)/careers/_lib/filters";
import { AlumniDirectory } from "./_components/alumni-directory";

/**
 * /alumni (PLAN §3; §1 "Alumni"): the verified alumni directory, for verified @davidson.edu accounts only. Behind
 * FEATURE_ALUMNI and FEATURE_CAREERS (404 while either is off; the shell hides Alumni then): featureMetadata() is
 * the generateMetadata (a static `metadata` would title the 404 "Alumni") and requireFeature() the page's first
 * line. Who is asking and what they may see is decided in <AlumniDirectory>, a server component below a Suspense
 * boundary; nothing about alumni reaches the browser for a viewer who may not see them.
 */
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("alumni", { title: "Alumni" });
}

export default async function AlumniPage({
  searchParams,
}: { searchParams?: Promise<SearchParamsRecord> } = {}) {
  await requireFeature("alumni");
  const params = (await searchParams) ?? {};
  return (
    <>
      <PageHeader
        title="Alumni"
        subtitle="Davidson alumni confirmed from public sources, with where each fact comes from."
      />
      <Suspense fallback={<DirectorySkeleton />}>
        <AlumniDirectory params={params} />
      </Suspense>
    </>
  );
}

function DirectorySkeleton() {
  return (
    <div>
      <p role="status" className="sr-only">
        Loading alumni…
      </p>
      <Skeleton className="mb-5 h-24 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
