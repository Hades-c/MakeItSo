import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { HANDSHAKE } from "@/server/content/links";
import { OFFICES, PROGRAMS } from "@/server/content/offices";
import { getCareer } from "@/server/content/careers";
import { featureMetadata, requireFeature } from "@/server/features";
import { careersHref } from "../_lib/filters";
import { formatContentDate } from "../_lib/format";
import { resolveResources } from "../_lib/resources";
import { CareerAiPanelsSlot } from "../_components/ai-slot";
import { CareerAlumni } from "../_components/career-alumni";
import { CareerCourses } from "../_components/career-courses";
import { CareerPrograms } from "../_components/career-programs";
import {
  DavidsonResourcesCard,
  ExternalResourcesCard,
  HandshakeCard,
  PayCard,
  WhatYouDoCard,
} from "../_components/career-sections";

type Params = Promise<{ slug: string }>;

/**
 * /careers/[slug] (PLAN §3): one of the 24 career paths; any other slug is a 404 (notFound(), inside the shell).
 *
 *   overview + what you do · pay (BLS: median, period, projected growth, source) · the real Davidson courses with
 *   live availability per term and Add to plan · related departments and official Acalog programs · Davidson
 *   resources and office programs (amounts and deadlines as published, tagged) · Handshake (base URL + search words)
 *   · verified alumni (verified @davidson.edu + FEATURE_ALUMNI only) · outside resources.
 *
 * The page itself only resolves the career (so an unknown slug answers 404 before anything streams); the parts that
 * read the catalog, the programs, the plan or the session render in their own Suspense boundaries. Behind
 * FEATURE_CAREERS: generateMetadata and the page both go through the gate first. No loading.tsx on purpose (it
 * would start streaming before notFound() could answer 404).
 */
export async function generateMetadata(props?: { params: Params }): Promise<Metadata> {
  if (!props) return featureMetadata("careers", { title: "Career path" });
  await requireFeature("careers");
  const career = getCareer((await props.params).slug);
  if (!career) notFound();
  return { title: career.name, description: career.summary };
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p role="status" className="sr-only">
        Loading…
      </p>
      <Skeleton className="h-full min-h-40 rounded-xl" />
    </div>
  );
}

const GRID = "grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]";
const STACK = "flex min-w-0 flex-col gap-5";

export default async function CareerPage({ params }: { params: Params }) {
  await requireFeature("careers");
  const { slug } = await params;
  const career = getCareer(slug);
  if (!career) notFound();

  const resources = resolveResources(career.davidsonResources, OFFICES, PROGRAMS);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-3">
          <li>
            <Link href={routes.careers()} className="font-semibold text-primary hover:underline">
              Careers
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={careersHref({ cluster: career.cluster })}
              className="font-semibold text-primary hover:underline"
            >
              {career.cluster}
            </Link>
          </li>
        </ol>
      </nav>
      <PageHeader title={career.name} subtitle={career.summary} />

      <div className="flex flex-col gap-5">
        <div className={GRID}>
          <WhatYouDoCard career={career} />
          <PayCard pay={career.pay} />
        </div>

        <Suspense fallback={<CardSkeleton className="h-96" />}>
          <CareerCourses career={career} />
        </Suspense>

        <div className={GRID}>
          <div className={STACK}>
            <DavidsonResourcesCard resources={resources} verifiedAt={career.verifiedAt} />
          </div>
          <div className={STACK}>
            <Suspense fallback={<CardSkeleton className="h-48" />}>
              <CareerPrograms career={career} />
            </Suspense>
            {/* The documented base URL only: Handshake publishes no keyword-search URL, so none is built. */}
            <HandshakeCard baseUrl={HANDSHAKE.baseUrl} query={career.handshakeQuery} />
          </div>
        </div>

        <Suspense fallback={<CardSkeleton className="h-48" />}>
          <CareerAlumni career={career} />
        </Suspense>

        {/* AI career plan + cold e-mail: a later lane (after W6). Renders nothing now. */}
        <CareerAiPanelsSlot career={career} />

        <ExternalResourcesCard resources={career.externalResources} />
        <p className="text-xs text-fg-3">
          Career information checked{" "}
          <time dateTime={career.verifiedAt}>{formatContentDate(career.verifiedAt)}</time> against
          Davidson and federal sources. Always confirm details with the office or program.
        </p>
      </div>
    </>
  );
}
