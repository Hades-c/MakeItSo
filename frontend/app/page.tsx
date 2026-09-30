import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  GraduationCap,
  Map as MapIcon,
  Network,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

// Static class names so Tailwind can see them (no safelist; audit devex/tailwind-safelist-7mb-css).
const TONES = {
  red: { bg: "bg-red-50", text: "text-red-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  blue: { bg: "bg-blue-50", text: "text-blue-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-600" },
} as const;

type Tone = keyof typeof TONES;

const FEATURES: { icon: typeof BookOpen; title: string; desc: string; color: Tone }[] = [
  {
    icon: BookOpen,
    title: "Course Planning",
    desc: "Search Davidson's live course schedule and build a semester-by-semester plan.",
    color: "red",
  },
  {
    icon: Briefcase,
    title: "Career Mapping",
    desc: "Explore career paths and the real Davidson courses that connect to them.",
    color: "rose",
  },
  {
    icon: Network,
    title: "Networking Guide",
    desc: "Know who to meet — advisors, programs and verified alumni — and when to reach out.",
    color: "blue",
  },
  {
    icon: TrendingUp,
    title: "Semester Roadmap",
    desc: "Draft a four-year plan, then check it against your requirements in DegreeWorks.",
    color: "emerald",
  },
  {
    icon: Users,
    title: "Campus in One Place",
    desc: "Events, deadlines and opportunities from across campus, each labelled with its source.",
    color: "amber",
  },
  {
    icon: GraduationCap,
    title: "Davidson-Native",
    desc: "Built around Davidson's own course data and graduation requirements.",
    color: "purple",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="glass fixed top-0 z-50 w-full border-b border-gray-200/30">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-800">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">MakeItSo</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button
              size="sm"
              className="bg-red-800 shadow-lg shadow-red-800/25 hover:bg-red-900"
              asChild
            >
              <Link href="/register">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pb-20 pt-32">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="animate-float absolute left-1/4 top-0 h-96 w-96 rounded-full bg-red-100/40 blur-3xl" />
          <div
            className="animate-float absolute right-1/4 top-20 h-80 w-80 rounded-full bg-rose-100/40 blur-3xl"
            style={{ animationDelay: "2s" }}
          />
          <div
            className="animate-float absolute bottom-0 left-1/2 h-72 w-72 rounded-full bg-red-50/50 blur-3xl"
            style={{ animationDelay: "4s" }}
          />
        </div>

        <div className="container max-w-4xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-800">
            <GraduationCap className="h-4 w-4" />
            Built for Davidson College students
          </div>

          <h1 className="mb-6 text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
            Your degree.
            <br />
            Your career.
            <br />
            <span className="gradient-text">One plan.</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Course and career planning that connects what you study to where you&apos;re going. Plan
            forward from your interests or backward from your dream career.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              className="h-12 bg-red-800 px-8 text-base shadow-xl shadow-red-800/25 hover:bg-red-900"
              asChild
            >
              <Link href="/register">
                Start Planning
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 border-gray-300 px-8 text-base"
              asChild
            >
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50/80 py-24">
        <div className="container">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-red-800">
              How it works
            </p>
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Two ways to plan your path
            </h2>
            <p className="text-lg text-muted-foreground">
              Start from where you are or where you want to be.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
            {/* Forward Planning */}
            <div className="group relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all duration-300 hover:border-red-200 hover:shadow-lg">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-3 text-xl font-bold">Plan Forward</h3>
              <p className="mb-6 leading-relaxed text-muted-foreground">
                Select your interests and completed courses. We&apos;ll show you which courses to
                take next and how each one connects to real career outcomes.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">
                    1
                  </div>
                  <span>Pick your subject interests</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">
                    2
                  </div>
                  <span>Mark courses you&apos;ve taken</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">
                    3
                  </div>
                  <span>See personalized recommendations with career impact</span>
                </div>
              </div>
            </div>

            {/* Backward Planning */}
            <div className="group relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all duration-300 hover:border-red-200 hover:shadow-lg">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-red-800 shadow-lg shadow-red-800/20">
                <MapIcon className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-3 text-xl font-bold">Plan Backward</h3>
              <p className="mb-6 leading-relaxed text-muted-foreground">
                Choose your dream career. We&apos;ll map out the courses to take, people to meet,
                and things to do between now and graduation.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-800">
                    1
                  </div>
                  <span>Select your target career or field</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-800">
                    2
                  </div>
                  <span>Get a complete action plan with timelines</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-800">
                    3
                  </div>
                  <span>Generate an optimized semester roadmap</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24">
        <div className="container">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-red-800">
              Features
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to graduate with purpose
            </h2>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="group rounded-xl border border-gray-100 bg-white p-6 transition-all duration-300 hover:border-gray-200 hover:shadow-md"
              >
                <div
                  className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${TONES[color].bg}`}
                >
                  <Icon className={`h-5 w-5 ${TONES[color].text}`} />
                </div>
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container">
          <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-red-800 via-red-900 to-rose-900" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="relative px-8 py-16 text-center text-white sm:px-16">
              <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Ready to make it happen?</h2>
              <p className="mx-auto mb-8 max-w-lg text-lg text-white/80">
                Join Davidson students who are planning smarter, connecting faster, and graduating
                with purpose.
              </p>
              <Button
                size="lg"
                className="h-12 bg-white px-8 text-base font-semibold text-red-800 shadow-xl hover:bg-gray-100"
                asChild
              >
                <Link href="/register">
                  Create Your Free Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-800">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold">MakeItSo</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Started at hack@DAVIDSON 2026 &middot; Built for Davidson College students
          </p>
        </div>
      </footer>
    </div>
  );
}
