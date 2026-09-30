import { AlumniGateNotice } from "@/app/(hub)/alumni/_components/alumni-gate-notice";
import { AlumnusCard } from "@/app/(hub)/alumni/_components/alumnus-card";
import { ProvenanceLine } from "@/app/(hub)/alumni/_components/provenance-line";
import { alumniAccessFor, alumniGateCopy } from "@/app/(hub)/alumni/_lib/access";
import { careersOf } from "@/app/(hub)/alumni/_lib/careers";
import { SectionCard } from "@/components/ui/section-card";
import { routes } from "@/lib/routes";
import type { Career } from "@/lib/types/content";
import { isMailAvailable } from "@/server/auth/mailer";
import { getSessionUser } from "@/server/auth/session";
import { ALUMNI_CHECKED_AT, alumniForCareer } from "@/server/content/alumni";
import { loadFlags } from "@/server/features";

/**
 * Verified alumni on this career path (PLAN §1, §3): only while the Alumni section is on
 * (featureEnabled(loadFlags(), "alumni")) — otherwise nothing at all, not even a link to /alumni — and only for a
 * verified @davidson.edu account; other accounts get a short explanation and no alumni data.
 */
export async function CareerAlumni({ career }: { career: Career }) {
  const user = await getSessionUser();
  const access = alumniAccessFor(user, loadFlags(), isMailAvailable);
  if (access.kind === "off") return null;

  if (access.kind !== "open") {
    return (
      <SectionCard id="alumni" title="Alumni on this path">
        <AlumniGateNotice
          {...alumniGateCopy(access, routes.career(career.slug))}
          variant="inline"
        />
      </SectionCard>
    );
  }

  const alumni = alumniForCareer(career.slug);
  return (
    <SectionCard
      id="alumni"
      title="Alumni on this path"
      count={alumni.length}
      link={{ href: routes.alumni({ career: career.slug }), label: "All alumni" }}
    >
      <ProvenanceLine checkedAt={ALUMNI_CHECKED_AT} className="-mt-1.5 mb-3" />
      {alumni.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="career-alumni">
          {alumni.map((alumnus) => (
            <li key={alumnus.id} className="flex min-w-0">
              <AlumnusCard
                alumnus={alumnus}
                careers={careersOf(alumnus).filter((path) => path.slug !== career.slug)}
                careersLabel="Also on"
                className="w-full"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-2" data-testid="career-alumni-empty">
          No verified alumni are listed on this path yet. Alumni appear only once their Davidson
          degree and public profile are both verified.
        </p>
      )}
    </SectionCard>
  );
}
