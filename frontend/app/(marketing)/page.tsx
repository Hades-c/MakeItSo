import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Map as MapIcon,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/app/wordmark";
import { AiChip } from "@/components/ui/ai-chip";
import { SourceTag, SourceTagList } from "@/components/ui/source-tag";
import type { SourceId } from "@/lib/sources";
import { cn } from "@/lib/utils";
import {
  HeaderActions,
  HeaderActionsView,
  HeroActions,
  HeroActionsView,
} from "./_components/account-actions";
import { LandingFacts } from "./_components/landing-facts";
import { joinWords, landingSources, loadLandingClaims, type LandingClaims } from "./_lib/claims";

// Marketing landing ("/", PLAN §3). Copy states only what MakeItSo does; no invented statistics (audit
// design-ux/dashboard-static-and-contradictory-claims). The only numbers are runtime facts (./_lib/facts.ts),
// computed per request and left out when they cannot be computed. Sections behind a feature flag (careers, alumni,
// events, AI, ratings) are described only while a visitor could use them (./_lib/claims.ts). Signed-out visitors
// see the page below; signed-in students get "Go to Today" in place of the sign-in and sign-up buttons, streamed
// in without holding the page up (./_components/account-actions.tsx).

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

function features(claims: LandingClaims): Feature[] {
  return [
    {
      icon: BookOpen,
      title: "Courses",
      body: "Search Davidson's course schedule: sections, seats, meeting times and the requirements each course fills.",
    },
    {
      icon: MapIcon,
      title: "My plan",
      body: "Lay out all eight semesters, track your credits and requirements, and check it against Degree Works.",
    },
    ...(claims.careers
      ? [
          {
            icon: BriefcaseBusiness,
            title: "Careers",
            body: claims.alumni
              ? "See the real courses, campus programs and verified alumni connected to a career path."
              : "See the real courses and campus programs connected to a career path.",
          },
        ]
      : []),
    ...(claims.events
      ? [
          {
            icon: CalendarDays,
            title: "Campus",
            body: "Events and deadlines from across campus in one list, so fewer things slip through.",
          },
        ]
      : []),
  ];
}

/** Static class names for Tailwind: the feature grid has as many desktop columns as cards. */
const FEATURE_COLUMNS: Readonly<Record<number, string>> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/** What MakeItSo shows, and the source tag each kind of item carries. Descriptive only: no sample data. */
function provenance(claims: LandingClaims): { what: string; source: SourceId }[] {
  return [
    { what: "Sections, seats and meeting times", source: "course-schedule" },
    { what: "Registration windows and academic deadlines", source: "registrar" },
    ...(claims.ratings
      ? [
          {
            what: "Professor ratings, with the date they were checked",
            source: "ratemyprofessors" as const,
          },
        ]
      : []),
    ...(claims.events ? [{ what: "Club and campus events", source: "wildcatsync" as const }] : []),
    { what: "Courses you have taken and plan to take", source: "my-plan" },
  ];
}

function heroSentence(claims: LandingClaims): string {
  const parts = [
    "the course schedule",
    "a four-year plan",
    ...(claims.careers ? ["career paths"] : []),
    ...(claims.events ? ["campus events"] : []),
  ];
  return `MakeItSo brings ${joinWords(parts)} together, and labels every item with where it came from.`;
}

function taggedKinds(claims: LandingClaims): string {
  const kinds = [
    "Deadlines",
    ...(claims.ratings ? ["ratings"] : []),
    ...(claims.events ? ["events"] : []),
  ];
  return `${joinWords(kinds)} keep a tag naming their source`;
}

export default async function HomePage() {
  // Flags and capabilities are read per request, never at build time.
  await connection();
  const claims = loadLandingClaims();
  const featureCards = features(claims);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Link
            href="/"
            aria-label="MakeItSo home"
            className="-m-1 inline-flex min-h-11 items-center rounded-md p-1 md:min-h-0"
          >
            <Wordmark />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Suspense fallback={<HeaderActionsView signedIn={false} />}>
              <HeaderActions />
            </Suspense>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:px-6 md:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          <div>
            <p className="mb-4 font-mono text-xs font-medium tracking-label text-fg-3 uppercase">
              For Davidson College students
            </p>
            <h1 className="text-xl font-strong md:text-3xl">
              {claims.events
                ? "Your courses, your plan and your campus, in one place."
                : "Your courses and your plan, in one place."}
            </h1>
            <p className="mt-5 max-w-xl text-base text-fg-2 md:text-lg">{heroSentence(claims)}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Suspense fallback={<HeroActionsView signedIn={false} />}>
                <HeroActions />
              </Suspense>
            </div>
            <Suspense fallback={null}>
              <LandingFacts />
            </Suspense>
          </div>

          <section
            aria-labelledby="provenance-title"
            className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6"
          >
            <h2
              id="provenance-title"
              className="font-mono text-xs font-medium tracking-label text-fg-3 uppercase"
            >
              Every item is labelled
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {provenance(claims).map((item) => (
                <li
                  key={item.source}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 text-sm font-semibold text-fg"
                >
                  <span className="min-w-0">{item.what}</span>
                  <SourceTag source={item.source} />
                </li>
              ))}
              {claims.ai ? (
                <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 text-sm font-semibold text-fg">
                  <span className="min-w-0">Suggestions for your plan</span>
                  <AiChip />
                </li>
              ) : null}
            </ul>
          </section>
        </section>

        <section aria-labelledby="features-title" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
            <h2 id="features-title" className="text-xl font-strong">
              One place instead of many tabs
            </h2>
            <ul
              className={cn("mt-8 grid gap-4 sm:grid-cols-2", FEATURE_COLUMNS[featureCards.length])}
            >
              {featureCards.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-xl border border-line bg-bg p-5">
                  <span className="mb-4 grid size-10 place-items-center rounded-md bg-primary-wash text-primary">
                    <Icon aria-hidden strokeWidth={1.8} className="size-5" />
                  </span>
                  <h3 className="text-lg font-strong tracking-title">{title}</h3>
                  <p className="mt-1.5 text-sm text-fg-2">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="sources-title"
          className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16"
        >
          <div className="max-w-2xl">
            <h2 id="sources-title" className="text-xl font-strong">
              Every item shows where it came from
            </h2>
            <p className="mt-3 text-base text-fg-2">
              Course data comes from the Registrar&apos;s public schedule. {taggedKinds(claims)}, so
              you always know what to double-check.
            </p>
          </div>
          <SourceTagList
            label="Sources MakeItSo draws on"
            sources={landingSources(claims)}
            className="mt-6"
          />
          <div
            className="mt-8 flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 md:flex-row md:items-center"
            data-testid="landing-ai"
          >
            {claims.ai ? (
              <>
                <AiChip />
                <p className="text-sm text-fg-2">
                  AI-assisted suggestions are grounded in the real course catalog and always marked,
                  so you can check them with your advisor.
                </p>
              </>
            ) : (
              <p className="text-sm text-fg-2">
                AI features are coming. They will be optional: off until you turn them on in your
                profile, and marked wherever they appear.
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-fg-3 md:flex-row md:justify-between md:px-6">
          <span>
            An independent student project, not an official Davidson College service. Started at
            hack@DAVIDSON 2026.
          </span>
          <span>Always confirm requirements with your advisor and in Degree Works.</span>
        </div>
      </footer>
    </div>
  );
}
