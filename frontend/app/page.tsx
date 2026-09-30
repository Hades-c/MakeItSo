import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Map as MapIcon,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/app/wordmark";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { SourceTag, SourceTagList } from "@/components/ui/source-tag";
import type { SourceId } from "@/lib/sources";

// Marketing landing. Copy states only what MakeItSo does; no invented statistics (audit
// design-ux/dashboard-static-and-contradictory-claims).

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
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
  {
    icon: BriefcaseBusiness,
    title: "Careers",
    body: "See the real courses, campus programs and verified alumni connected to a career path.",
  },
  {
    icon: CalendarDays,
    title: "Campus",
    body: "Events and deadlines from across campus in one list, so fewer things slip through.",
  },
];

/** What MakeItSo shows, and the source tag each kind of item carries. Descriptive only: no sample data. */
const PROVENANCE: { what: string; source: SourceId }[] = [
  { what: "Sections, seats and meeting times", source: "course-schedule" },
  { what: "Registration windows and academic deadlines", source: "registrar" },
  { what: "Professor ratings, with the date they were checked", source: "ratemyprofessors" },
  { what: "Club, library and campus events", source: "wildcatsync" },
  { what: "Courses you have taken and plan to take", source: "my-plan" },
];

const ALL_SOURCES: SourceId[] = [
  "course-schedule",
  "registrar",
  "ratemyprofessors",
  "wildcatsync",
  "hurt-hub",
  "library",
  "davidsonian",
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" aria-label="MakeItSo home" className="-m-1 rounded-md p-1">
            <Wordmark />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Create account</Link>
            </Button>
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
              Your courses, your plan and your campus, in one place.
            </h1>
            <p className="mt-5 max-w-xl text-base text-fg-2 md:text-lg">
              MakeItSo brings the course schedule, a four-year plan, career paths and campus events
              together, and labels every item with where it came from.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  Create your account
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
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
              {PROVENANCE.map((item) => (
                <li
                  key={item.source}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 text-sm font-semibold text-fg"
                >
                  <span className="min-w-0">{item.what}</span>
                  <SourceTag source={item.source} />
                </li>
              ))}
              <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 text-sm font-semibold text-fg">
                <span className="min-w-0">Suggestions for your plan</span>
                <AiChip />
              </li>
            </ul>
          </section>
        </section>

        <section aria-labelledby="features-title" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
            <h2 id="features-title" className="text-xl font-strong">
              One place instead of many tabs
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
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
              Course data comes from the Registrar&apos;s public schedule. Deadlines, ratings and
              events keep a tag naming their source, so you always know what to double-check.
            </p>
          </div>
          <SourceTagList label="Sources MakeItSo draws on" sources={ALL_SOURCES} className="mt-6" />
          <div className="mt-8 flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 md:flex-row md:items-center">
            <AiChip />
            <p className="text-sm text-fg-2">
              AI-assisted suggestions are grounded in the real course catalog and always marked, so
              you can check them with your advisor.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-fg-3 md:flex-row md:justify-between md:px-6">
          <span>Started at hack@DAVIDSON 2026.</span>
          <span>Always confirm requirements with your advisor and in Degree Works.</span>
        </div>
      </footer>
    </div>
  );
}
