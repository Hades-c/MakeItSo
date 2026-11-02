import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";
import { requireUser } from "@/server/auth/session";
import { featureEnabled, featureMetadata, loadFlags, requireFeature } from "@/server/features";
import type { SearchParamsRecord } from "@/app/(hub)/careers/_lib/filters";
import { PreviewNotice } from "./_components/preview-notice";
import { SampleDirectory } from "./_components/sample-directory";

/**
 * /alumni/preview: the Davidson Connect preview (owner's request, for pitching). FICTIONAL sample profiles
 * (server/content/alumni-sample.ts) laid out as the college's alumni platform will be once it is connected; MakeItSo
 * has no Davidson Connect data and no connection to it.
 *
 * - Behind FEATURE_ALUMNI_PREVIEW and FEATURE_CAREERS (server/features.ts alumniPreviewEnabled; 404 while off):
 *   featureMetadata() is the generateMetadata and requireFeature() the page's first line. Independent of
 *   FEATURE_ALUMNI and of verification: it holds no personal data, so every signed-in student may open it.
 * - The non-dismissable notice comes first, every card says "Sample", and Connect / Message are disabled with the
 *   reason. Nothing here reads the verified directory; its header links to it ("Alumni", its label everywhere) only
 *   while the Alumni section is on.
 * - Reached from the Careers header and each career page; it is not a nav section and not in ⌘K or site search.
 */
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("alumniPreview", { title: "Davidson Connect preview" });
}

export default async function AlumniPreviewPage({
  searchParams,
}: { searchParams?: Promise<SearchParamsRecord> } = {}) {
  await requireFeature("alumniPreview");
  // Its own sign-in check: the hub layout renders in parallel with the page, so a page relying on the layout
  // alone streams its content into the signed-out visitor's redirect.
  await requireUser();
  const params = (await searchParams) ?? {};
  return (
    <>
      <PageHeader
        title="Davidson Connect preview"
        subtitle="How alumni on Davidson Connect, the college’s alumni platform, will appear here once it is connected."
        actions={
          featureEnabled(loadFlags(), "alumni") ? (
            <Button asChild variant="secondary">
              <Link href={routes.alumni()}>
                <Users aria-hidden className="size-4" />
                Alumni
              </Link>
            </Button>
          ) : null
        }
      />
      <PreviewNotice className="mb-5" />
      <SampleDirectory params={params} />
    </>
  );
}
