import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  GraduationCap,
  Map,
  Network,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-gray-200/30">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">MakeItSo</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25" asChild>
              <Link href="/register">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-200/40 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-80 h-80 bg-indigo-200/40 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/2 w-72 h-72 bg-purple-200/30 rounded-full blur-3xl" />
        </div>

        <div className="container text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-sm font-medium mb-8 animate-fade-in">
            <GraduationCap className="h-4 w-4" />
            Built for Davidson College students
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 animate-slide-up">
            Your degree.
            <br />
            Your career.
            <br />
            <span className="gradient-text">One plan.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
            AI-powered course planning that connects what you study to where you&apos;re going.
            Plan forward from your interests or backward from your dream career.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-xl shadow-violet-500/25 text-base h-12 px-8" asChild>
              <Link href="/register">
                Start Planning
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base h-12 px-8 border-gray-300" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-gray-50/80">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-semibold text-violet-600 uppercase tracking-wider mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Two ways to plan your path</h2>
            <p className="text-muted-foreground text-lg">Start from where you are or where you want to be.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Forward Planning */}
            <div className="group relative bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg hover:border-violet-200 transition-all duration-300">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Plan Forward</h3>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Select your interests and completed courses. We&apos;ll show you which courses to take next
                and how each one connects to real career outcomes.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">1</div>
                  <span>Pick your subject interests</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">2</div>
                  <span>Mark courses you&apos;ve taken</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">3</div>
                  <span>See personalized recommendations with career impact</span>
                </div>
              </div>
            </div>

            {/* Backward Planning */}
            <div className="group relative bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg hover:border-violet-200 transition-all duration-300">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
                <Map className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Plan Backward</h3>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Choose your dream career. We&apos;ll map out the courses to take, people to meet,
                and things to do between now and graduation.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold">1</div>
                  <span>Select your target career or field</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold">2</div>
                  <span>Get a complete action plan with timelines</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold">3</div>
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
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-semibold text-violet-600 uppercase tracking-wider mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to graduate with purpose</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { icon: BookOpen, title: "Smart Course Planning", desc: "Prerequisite-aware recommendations from Davidson's real course catalog with professor ratings.", color: "violet" },
              { icon: Briefcase, title: "Career Mapping", desc: "See how every course connects to career outcomes with AI-powered relevance scoring.", color: "indigo" },
              { icon: Network, title: "Networking Guide", desc: "Know who to meet — alumni, advisors, and professionals — and when to reach out.", color: "purple" },
              { icon: TrendingUp, title: "Semester Roadmap", desc: "AI-generated optimal course sequence weighing professor quality and timing.", color: "emerald" },
              { icon: Users, title: "People to Meet", desc: "Find alumni in your target field, department chairs, and career advisors with contact info.", color: "blue" },
              { icon: GraduationCap, title: "Davidson-Native", desc: "Built with real Davidson data — every major, department, and course offering.", color: "rose" },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="group p-6 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-300">
                <div className={`h-10 w-10 rounded-lg bg-${color}-50 flex items-center justify-center mb-4`}>
                  <Icon className={`h-5 w-5 text-${color}-600`} />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container">
          <div className="relative max-w-3xl mx-auto rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="relative px-8 py-16 sm:px-16 text-center text-white">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to make it happen?</h2>
              <p className="text-lg text-white/80 mb-8 max-w-lg mx-auto">
                Join Davidson students who are planning smarter, connecting faster, and graduating with purpose.
              </p>
              <Button size="lg" className="bg-white text-violet-700 hover:bg-gray-100 shadow-xl text-base h-12 px-8 font-semibold" asChild>
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
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold">MakeItSo</span>
          </div>
          <p className="text-xs text-muted-foreground">
            hack@DAVIDSON 2025 &middot; Built for Davidson College students
          </p>
        </div>
      </footer>
    </div>
  );
}
