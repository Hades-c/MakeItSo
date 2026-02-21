"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
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

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-gray-200/30">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-red-800 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">MakeItSo</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button size="sm" className="bg-red-800 hover:bg-red-900 shadow-lg shadow-red-800/25" asChild>
              <Link href="/register">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-100/40 rounded-full blur-3xl animate-float" />
          <div className="absolute top-20 right-1/4 w-80 h-80 bg-rose-100/40 rounded-full blur-3xl animate-float" style={{ animationDelay: "2s" }} />
          <div className="absolute bottom-0 left-1/2 w-72 h-72 bg-red-50/50 rounded-full blur-3xl animate-float" style={{ animationDelay: "4s" }} />
        </div>

        <motion.div
          className="container text-center max-w-4xl"
          initial="initial"
          animate="animate"
          variants={stagger}
        >
          <motion.div
            variants={fadeIn}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-800 text-sm font-medium mb-8"
          >
            <GraduationCap className="h-4 w-4" />
            Built for Davidson College students
          </motion.div>

          <motion.h1
            variants={fadeIn}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
          >
            Your degree.
            <br />
            Your career.
            <br />
            <span className="gradient-text">One plan.</span>
          </motion.h1>

          <motion.p
            variants={fadeIn}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            AI-powered course planning that connects what you study to where you&apos;re going.
            Plan forward from your interests or backward from your dream career.
          </motion.p>

          <motion.div
            variants={fadeIn}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Button size="lg" className="bg-red-800 hover:bg-red-900 shadow-xl shadow-red-800/25 text-base h-12 px-8" asChild>
              <Link href="/register">
                Start Planning
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base h-12 px-8 border-gray-300" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-gray-50/80">
        <div className="container">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-semibold text-red-800 uppercase tracking-wider mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Two ways to plan your path</h2>
            <p className="text-muted-foreground text-lg">Start from where you are or where you want to be.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Forward Planning */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="group relative bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg hover:border-red-200 transition-all duration-300"
            >
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
            </motion.div>

            {/* Backward Planning */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="group relative bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg hover:border-red-200 transition-all duration-300"
            >
              <div className="h-12 w-12 rounded-xl bg-red-800 flex items-center justify-center mb-6 shadow-lg shadow-red-800/20">
                <Map className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Plan Backward</h3>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Choose your dream career. We&apos;ll map out the courses to take, people to meet,
                and things to do between now and graduation.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center text-red-800 text-xs font-bold">1</div>
                  <span>Select your target career or field</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center text-red-800 text-xs font-bold">2</div>
                  <span>Get a complete action plan with timelines</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center text-red-800 text-xs font-bold">3</div>
                  <span>Generate an optimized semester roadmap</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24">
        <div className="container">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-semibold text-red-800 uppercase tracking-wider mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to graduate with purpose</h2>
          </motion.div>

          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={stagger}
          >
            {[
              { icon: BookOpen, title: "Smart Course Planning", desc: "Prerequisite-aware recommendations from Davidson's real course catalog with professor ratings.", color: "red" },
              { icon: Briefcase, title: "Career Mapping", desc: "See how every course connects to career outcomes with AI-powered relevance scoring.", color: "rose" },
              { icon: Network, title: "Networking Guide", desc: "Know who to meet — alumni, advisors, and professionals — and when to reach out.", color: "blue" },
              { icon: TrendingUp, title: "Semester Roadmap", desc: "AI-generated optimal course sequence weighing professor quality and timing.", color: "emerald" },
              { icon: Users, title: "People to Meet", desc: "Find alumni in your target field, department chairs, and career advisors with contact info.", color: "amber" },
              { icon: GraduationCap, title: "Davidson-Native", desc: "Built with real Davidson data — every major, department, and course offering.", color: "purple" },
            ].map(({ icon: Icon, title, desc, color }) => (
              <motion.div
                key={title}
                variants={fadeIn}
                className="group p-6 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-300 bg-white"
              >
                <div className={`h-10 w-10 rounded-lg bg-${color}-50 flex items-center justify-center mb-4`}>
                  <Icon className={`h-5 w-5 text-${color}-600`} />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-12 border-y bg-gray-50/50">
        <div className="container">
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center">
              <p className="text-3xl font-bold gradient-text">200+</p>
              <p className="text-sm text-muted-foreground mt-1">Davidson Courses</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold gradient-text">16</p>
              <p className="text-sm text-muted-foreground mt-1">Career Paths</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold gradient-text">AI</p>
              <p className="text-sm text-muted-foreground mt-1">Powered by Gemini</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold gradient-text">4 Years</p>
              <p className="text-sm text-muted-foreground mt-1">Full Roadmap</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container">
          <motion.div
            className="relative max-w-3xl mx-auto rounded-3xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-800 via-red-900 to-rose-900" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-30" />
            <div className="relative px-8 py-16 sm:px-16 text-center text-white">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to make it happen?</h2>
              <p className="text-lg text-white/80 mb-8 max-w-lg mx-auto">
                Join Davidson students who are planning smarter, connecting faster, and graduating with purpose.
              </p>
              <Button size="lg" className="bg-white text-red-800 hover:bg-gray-100 shadow-xl text-base h-12 px-8 font-semibold" asChild>
                <Link href="/register">
                  Create Your Free Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md bg-red-800 flex items-center justify-center">
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
