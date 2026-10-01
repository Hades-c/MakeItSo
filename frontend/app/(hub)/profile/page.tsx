import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, MailWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { UNVERIFIED_MESSAGE } from "@/lib/api/account";
import { formatMediumDate } from "@/lib/format";
import { queryString, routes } from "@/lib/routes";
import { requireUser } from "@/server/auth";
import { readEnv } from "@/server/env";
import { AcademicsForm } from "./_components/academics-form";
import { AiConsentPanel } from "./_components/ai-consent-panel";
import { DeleteAccount, DownloadData } from "./_components/data-controls";
import { FocusClearance } from "./_components/focus-clearance";
import { InterestsPicker } from "./_components/interests-picker";
import { NameForm } from "./_components/name-form";
import { PasswordForm } from "./_components/password-form";
import { Fact, FactList, ProfileSection } from "./_components/profile-section";
import { SignOutEverywhere } from "./_components/sign-out-everywhere";
import { loadProfilePage, type ProfilePageData } from "./_lib/load";

export const metadata: Metadata = { title: "Profile" };

/**
 * /profile (PLAN §3; R1): account, academics, interests, AI consent, security and "your data". A server component
 * that reads everything once (./_lib/load.ts) and hands each area to a small client island; every change goes
 * through callApi and the lib/api specs (W3's profile, AI-consent and account routes).
 */

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "academics", label: "Academics" },
  { id: "interests", label: "Interests" },
  { id: "ai-features", label: "AI features" },
  { id: "security", label: "Security" },
  { id: "your-data", label: "Your data" },
] as const;

export default async function ProfilePage() {
  const user = await requireUser({ returnTo: routes.profile() });
  const data = await loadProfilePage(user.id);
  const timeZone = readEnv("APP_TIMEZONE");
  const { profile } = data;

  return (
    <div className="max-w-3xl">
      <FocusClearance />
      <PageHeader
        title="Profile"
        subtitle="Your account, your academics and what MakeItSo keeps about you."
      />
      <nav aria-label="Profile sections" className="mb-5">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary hover:underline md:min-h-0"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-5">
        <ProfileSection id="account" title="Account">
          <div className="flex flex-col gap-5">
            <FactList>
              <Fact label="Email">{profile.email}</Fact>
              <Fact label="Verification">
                <Verification data={data} timeZone={timeZone} />
              </Fact>
            </FactList>
            <NameForm initialName={profile.name} />
          </div>
        </ProfileSection>

        <ProfileSection
          id="academics"
          title="Academics"
          description="Official names from the Davidson catalog. MakeItSo uses these to check your plan and fill in requirements."
        >
          <AcademicsForm
            initial={{
              majors: profile.majors,
              minors: profile.minors,
              graduationYear: profile.graduationYear,
              firstTerm: profile.firstTerm,
              standingOverride: profile.standingOverride,
            }}
            majorNames={data.majors}
            minorNames={data.minors}
            now={data.now}
          />
        </ProfileSection>

        <ProfileSection
          id="interests"
          title="Interests"
          description="Career paths you want to explore. Careers and suggestions start from these; each choice saves right away."
        >
          <InterestsPicker initial={profile.interests} careers={data.careers} />
        </ProfileSection>

        <ProfileSection
          id="ai-features"
          title="AI features"
          description="Optional, and off until you turn them on."
        >
          <AiConsentPanel
            aiConsentAt={profile.aiConsentAt}
            adultAttestedAt={profile.adultAttestedAt}
            aiEnabled={data.flags.ai}
            verifiedDavidson={data.verifiedDavidson}
            davidson={profile.davidson}
            mailAvailable={data.mailAvailable}
            timeZone={timeZone}
          />
        </ProfileSection>

        <ProfileSection id="security" title="Security">
          <div className="flex flex-col gap-5">
            <PasswordForm email={profile.email} />
            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <h3 className="text-base font-strong text-fg">Sessions</h3>
              <p className="text-sm text-fg-2">
                Signed in on a shared or lost device? Sign out of MakeItSo on every device at once.
              </p>
              <div>
                <SignOutEverywhere />
              </div>
            </div>
          </div>
        </ProfileSection>

        <ProfileSection id="your-data" title="Your data">
          <div className="flex flex-col gap-5">
            <DownloadData />
            <div className="border-t border-line pt-5">
              <h3 className="mb-2 text-base font-strong text-fg">Delete account</h3>
              <DeleteAccount />
            </div>
          </div>
        </ProfileSection>
      </div>
    </div>
  );
}

function Verification({ data, timeZone }: { data: ProfilePageData; timeZone: string }) {
  const { profile } = data;
  if (profile.emailVerifiedAt) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="success">
          <MailCheck aria-hidden />
          Verified
        </Badge>
        <span className="text-fg-2">on {formatMediumDate(profile.emailVerifiedAt, timeZone)}</span>
        {!profile.davidson ? <span className="text-fg-2">{UNVERIFIED_MESSAGE}</span> : null}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">
          <MailWarning aria-hidden />
          Not verified
        </Badge>
        {/* Only while a code can actually be sent: /verify is a dead end without a mail provider. */}
        {data.mailAvailable ? (
          <Link
            href={`${routes.verify()}${queryString({ next: routes.profile() })}`}
            className="-my-2 inline-flex min-h-11 items-center rounded-sm font-semibold text-primary hover:underline md:min-h-0"
          >
            Verify your email
          </Link>
        ) : null}
      </span>
      <span className="text-fg-2">
        {profile.davidson
          ? "A verified @davidson.edu address opens the alumni network and AI features."
          : UNVERIFIED_MESSAGE}
        {data.mailAvailable ? null : " Email verification is not available yet."}
      </span>
    </span>
  );
}
