import type { Metadata } from "next";
import type * as React from "react";
import Link from "next/link";
import { SUPPORT_CONTACT } from "@/app/(auth)/_lib/support";
import { Wordmark } from "@/components/app/wordmark";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What MakeItSo stores, what its optional AI features send to Anthropic, where alumni data comes from, how long anything is kept, and how to export or delete your data.",
};

/** When this notice last changed (update it with every change to the text). */
const LAST_UPDATED = "September 30, 2026";

/**
 * /privacy (PLAN §3, §6.1 W3): the Lakeside privacy notice. Static. Every statement here must stay true: the
 * retention periods match the models (verification codes valid 15 min and deleted after 24 h, per-user AI cache
 * 30 days, feed items 60 days, rate limits by window), the AI payload allow-list (server/ai/payloads.ts), the
 * account data registry (server/account/erasers.ts: the built-in legacy erasers cover `courseplans`,
 * `careergoals` and the personal `aicaches` rows; legacy cold-email rows are keyed by name only and are not
 * covered), the cookies NextAuth sets, and the mail adapter (server/auth/mailer.ts: Resend). Change the text in
 * the same commit as the behaviour.
 */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-6">
      <h2 id={id} className="text-lg font-strong tracking-title text-fg md:text-xl">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-base text-fg-2 [&_b]:font-semibold [&_b]:text-fg [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function Retention({ what, how }: { what: string; how: string }) {
  return (
    <div className="grid gap-1 py-2.5 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-4">
      <dt className="font-semibold text-fg">{what}</dt>
      <dd className="text-fg-2">{how}</dd>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href={routes.home()} aria-label="MakeItSo home" className="-m-1 rounded-md p-1">
            <Wordmark />
          </Link>
          <Button asChild variant="ghost">
            <Link href={routes.login()}>Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <p className="mb-3 font-mono text-xs font-medium tracking-label text-fg-3 uppercase">
          Last updated {LAST_UPDATED}
        </p>
        <h1 className="text-xl font-strong text-fg md:text-2xl">Privacy at MakeItSo</h1>
        <p className="mt-4 text-base text-fg-2 md:text-lg">
          MakeItSo is an <b className="font-semibold text-fg">independent student project</b> for
          Davidson College students. It is{" "}
          <b className="font-semibold text-fg">not a Davidson College service</b>: the College does
          not run, review or endorse it, and it will never ask for your Davidson password.
        </p>

        <section
          className="mt-8 rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
          aria-labelledby="short-version"
        >
          <h2
            id="short-version"
            className="font-mono text-xs font-medium tracking-label text-fg-3 uppercase"
          >
            The short version
          </h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-fg md:text-base">
            <li>We store your account, your profile and your plan so the app works. No grades.</li>
            <li>
              AI features are off until you turn them on. When on, they send course and plan details
              to Anthropic, never your name, email or grades.
            </li>
            <li>No ads, no analytics trackers, and nothing is sold or shared for marketing.</li>
            <li>You can download everything we store about you, or delete it, at any time.</li>
          </ul>
        </section>

        <div className="mt-10 flex flex-col gap-10">
          <Section id="what-we-store" title="What we store">
            <p>When you create an account and use MakeItSo, we store:</p>
            <ul>
              <li>
                <b>Account:</b> your name, your email address, a one-way hash of your password
                (never the password itself), when your email was verified, and a session counter
                that lets you sign out on every device.
              </li>
              <li>
                <b>Profile:</b> the majors and minors, graduation year, first term, class standing
                and career interests you choose, whether you finished onboarding, and when you
                turned AI features on and confirmed you are 18 or older.
              </li>
              <li>
                <b>Your plan:</b> the courses you add (term, course, credits and a status such as
                planned or completed), your WebTree list, the deadlines and summer activities you
                enter, and plan suggestions you asked for. We never store grades.
              </li>
              <li>
                <b>Security records:</b> one-time email codes (stored only as a hash), and
                short-lived counters that limit sign-in and sign-up attempts. Those counters hold
                your IP address or a hash of your email address.
              </li>
              <li>
                <b>From the earlier version of MakeItSo:</b> if you used the hackathon version, the
                plan you saved there, and the profile fields it kept on your account (a short bio,
                your year, career interests, a picture address and a credit total), are kept
                (read-only) so they can be carried over. So are the career goals you entered there
                and the AI answers it generated for you (course plans, career plans and course
                recommendations). All of these are in your download and deleted with your account.
                That version also saved cold-email drafts under your name only, not linked to your
                account, so we cannot find them reliably: ask us (see Contact) and we will delete
                them.
              </li>
            </ul>
            <p>
              Signing in sets three cookies from the sign-in library: the session cookie, which
              keeps you signed in for up to 14 days, a security token that protects the sign-in
              form, and the page to return to after signing in. Your light or dark theme choice is
              saved in your own browser. There are no advertising or analytics trackers, and our
              fonts are served by MakeItSo itself.
            </p>
            <p>
              <b>Email:</b> once email verification is turned on, verification and password-reset
              emails are sent through{" "}
              <a
                href="https://resend.com/legal/privacy-policy"
                className="font-semibold text-primary underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                Resend
              </a>
              , an email delivery service, which receives your email address and the message
              (including its one-time code). MakeItSo sends no other email.
            </p>
            <p>
              MakeItSo is not an approved Davidson tool for Internal or Restricted college data.
              Please do not paste Degree Works reports, Moodle content or other college records into
              it.
            </p>
            <p>
              Course, catalog, rating and event information comes from public sources
              (Davidson&apos;s public course schedule and catalog, RateMyProfessors, and public
              campus feeds), and every item is labelled with its source.
            </p>
          </Section>

          <Section id="ai" title="AI features (optional)">
            <p>
              MakeItSo&apos;s AI features (course summaries, plan suggestions, career plans and
              cold-email drafts) use <b>Claude, a model made by Anthropic</b>. They are{" "}
              <b>off until you turn them on</b> in your profile, which asks you to confirm that you
              are 18 or older, and they need a verified @davidson.edu account. You can turn them off
              again at any time.
            </p>
            <p>
              When you use an AI feature, MakeItSo sends Anthropic only what that feature needs:
            </p>
            <ul>
              <li>course codes and public catalog information;</li>
              <li>
                the courses in your plan and which requirements they fill, your majors and minors,
                graduation year and career interests;
              </li>
              <li>the goal or question you type into that feature.</li>
            </ul>
            <p>
              It <b>never sends your name, your email address, your account id or any grades</b>.
              Cold-email drafts use a placeholder that your browser fills in with your name after
              the draft comes back. Anthropic handles these requests under its commercial API terms
              and{" "}
              <a
                href="https://www.anthropic.com/legal/privacy"
                className="font-semibold text-primary underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                privacy policy
              </a>
              . AI answers are marked &quot;AI · verify with your advisor&quot;.
            </p>
          </Section>

          <Section id="alumni" title="Alumni information">
            <p>
              The alumni directory lists only people confirmed as Davidson alumni from public
              sources, such as Davidson College publications and news, and employer or organization
              websites. Each fact shown (class year, major, role, organization) has at least one
              source other than LinkedIn; a LinkedIn profile address is typed in by hand and never
              fetched by MakeItSo. We keep only name, class year, majors, role, organization, the
              date that role was checked, the LinkedIn address, related career paths, whether a cold
              email is appropriate, and the sources. No location, biography or contact details.
            </p>
            <p>
              The directory is visible only to signed-in students with a verified @davidson.edu
              address. Every entry says where it came from and when it was checked.{" "}
              <b>If you are listed and want to be removed or corrected</b>, contact us (below) and
              we will remove or fix the entry.
            </p>
          </Section>

          <Section id="retention" title="How long we keep things">
            <dl className="divide-y divide-line text-sm md:text-base">
              <Retention what="Account, profile, plan" how="Until you delete your account." />
              <Retention
                what="Your AI results"
                how="Saved for you for 30 days, then deleted. Shared course summaries contain no personal information."
              />
              <Retention
                what="Email codes"
                how="Work for 15 minutes. The record (only a hash of the code) is deleted automatically 24 hours after it was sent."
              />
              <Retention
                what="Unverified sign-ups"
                how="Once email verification is available: if a sign-up was emailed a code and is still not verified 24 hours later, a new sign-up with the same address can replace it, and the old account's data is deleted. A sign-up that was never sent a code is never replaced."
              />
              <Retention
                what="Rate-limit counters"
                how="Only for their time window: 15 minutes to one day. A streak of failed sign-ins is forgotten 24 hours after the last failure."
              />
              <Retention
                what="Campus feed items"
                how="Public events and news are kept for 60 days."
              />
            </dl>
            <p>Our hosting provider keeps short-lived technical request logs to run the service.</p>
          </Section>

          <Section id="your-data" title="Export or delete your data">
            <ul>
              <li>
                <b>Download my data</b> on your{" "}
                <Link href={routes.profile()} className="font-semibold text-primary underline">
                  profile
                </Link>{" "}
                gives you a JSON file of everything MakeItSo stores about you (up to 5 times a day),
                except the earlier version&apos;s cold-email drafts described above.
              </li>
              <li>
                <b>Delete account</b> asks for your password, then immediately deletes your account
                and everything tied to it: profile, plan, AI results, codes and counters, and the
                earlier version&apos;s plan, career goals and AI answers (for its cold-email drafts,
                ask us). This cannot be undone.
              </li>
              <li>
                <b>Turn off AI features</b> and <b>sign out everywhere</b> are on your profile too.
              </li>
            </ul>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              Questions, removal or correction requests: reach the people who run MakeItSo through{" "}
              <a
                href={SUPPORT_CONTACT.url}
                className="font-semibold text-primary underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                {SUPPORT_CONTACT.label}
              </a>
              . Please do not post your password, email address or other private details in a public
              issue: ask for a private way to get in touch instead.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-fg-3 md:px-6">
          An independent student project, not an official Davidson College service.
        </div>
      </footer>
    </div>
  );
}
