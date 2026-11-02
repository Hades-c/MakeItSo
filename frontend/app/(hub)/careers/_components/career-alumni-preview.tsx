import Link from "next/link";
import { FlaskConical, Users } from "lucide-react";
import { SAMPLE_PROFILES_SENTENCE } from "@/app/(hub)/alumni/preview/_components/preview-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { routes } from "@/lib/routes";
import type { Career } from "@/lib/types/content";
import { sampleAlumniCountForCareer } from "@/server/content/alumni-sample";
import { alumniPreviewEnabled, loadFlags } from "@/server/features";

/**
 * The career page's way into the Davidson Connect preview (/alumni/preview?career=<slug>), right after the verified
 * "Alumni on this path" card: a separate card, titled and badged as a preview with sample data, so the fictional
 * profiles are never read as this path's verified alumni. It shows no profile itself, only how many sample
 * profiles the link leads to. Only while FEATURE_ALUMNI_PREVIEW (and Careers) is on; any signed-in student.
 */
export function CareerAlumniPreview({ career }: { career: Career }) {
  if (!alumniPreviewEnabled(loadFlags())) return null;
  const count = sampleAlumniCountForCareer(career.slug);
  return (
    <SectionCard
      id="alumni-preview"
      title={
        <>
          Davidson Connect preview
          <Badge variant="warning">
            <FlaskConical aria-hidden />
            Sample data
          </Badge>
        </>
      }
    >
      <p className="text-sm text-fg-2">{SAMPLE_PROFILES_SENTENCE}</p>
      <div className="mt-3">
        <Button asChild variant="secondary">
          <Link
            href={routes.alumniPreview({ career: career.slug })}
            data-testid="alumni-preview-link"
          >
            <Users aria-hidden className="size-4" />
            {count > 0
              ? `See ${count} sample ${count === 1 ? "profile" : "profiles"} on this path`
              : "See the sample profiles"}
          </Link>
        </Button>
      </div>
    </SectionCard>
  );
}
