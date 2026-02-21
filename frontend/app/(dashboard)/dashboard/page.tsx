"use client";

import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Compass,
  GraduationCap,
  Map,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <motion.div
      className="max-w-5xl mx-auto space-y-6"
      initial="initial"
      animate="animate"
      variants={stagger}
    >
      {/* Hero welcome */}
      <motion.div variants={fadeIn} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f1117] via-[#1a1c25] to-[#0f1117] p-8 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(185,28,28,0.15),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.08),transparent_50%)]" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-sm text-red-300 font-medium mb-2">
            <Sparkles className="h-4 w-4" />
            {greeting}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Welcome back, {firstName}
          </h1>
          <p className="text-gray-400 max-w-lg">
            Your academic journey, mapped out. Let&apos;s keep building your plan.
          </p>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={fadeIn} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Courses", value: "200+", icon: BookOpen, gradient: "from-emerald-500 to-teal-600" },
          { label: "Career Paths", value: "16", icon: Target, gradient: "from-red-600 to-rose-600" },
          { label: "Powered by", value: "Gemini", icon: Zap, gradient: "from-blue-500 to-indigo-600" },
          { label: "Built for", value: "Davidson", icon: GraduationCap, gradient: "from-rose-500 to-pink-600" },
        ].map(({ label, value, icon: Icon, gradient }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200/60 p-4 hover:shadow-md transition-shadow">
            <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-sm`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* Two big CTAs */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-2 gap-4">
        <Link href="/explore" className="group">
          <div className="h-full rounded-xl border border-gray-200/60 bg-white p-6 hover:shadow-lg hover:border-emerald-300/60 transition-all duration-300 overflow-hidden relative">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-gradient-to-bl from-emerald-100/80 to-transparent rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                <Compass className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg mb-1 group-hover:text-emerald-700 transition-colors">
                  Explore Courses
                  <ArrowRight className="inline ml-2 h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground">
                  Discover courses by interest and see how they connect to real careers.
                </p>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/career" className="group">
          <div className="h-full rounded-xl border border-gray-200/60 bg-white p-6 hover:shadow-lg hover:border-red-300/60 transition-all duration-300 overflow-hidden relative">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-gradient-to-bl from-red-100/80 to-transparent rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-700 to-rose-600 flex items-center justify-center shadow-lg shadow-red-700/20 shrink-0">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg mb-1 group-hover:text-red-800 transition-colors">
                  Career Paths
                  <ArrowRight className="inline ml-2 h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground">
                  Explore 16 careers with courses, alumni, and AI-powered roadmaps.
                </p>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Feature bento grid */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-3 gap-3">
        <Link href="/roadmap" className="group">
          <div className="h-full rounded-xl border border-gray-200/60 bg-white p-5 hover:shadow-md hover:border-blue-300/60 transition-all duration-300">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 shadow-sm">
              <Map className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-semibold mb-1 group-hover:text-blue-700 transition-colors">
              My Roadmap
            </h3>
            <p className="text-sm text-muted-foreground">
              AI-generated semester-by-semester plan for your major.
            </p>
          </div>
        </Link>

        <Link href="/courses" className="group">
          <div className="h-full rounded-xl border border-gray-200/60 bg-white p-5 hover:shadow-md hover:border-amber-300/60 transition-all duration-300">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-3 shadow-sm">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-semibold mb-1 group-hover:text-amber-700 transition-colors">
              Course Plan
            </h3>
            <p className="text-sm text-muted-foreground">
              Build your 4-year plan and track degree progress.
            </p>
          </div>
        </Link>

        <Link href="/profile" className="group">
          <div className="h-full rounded-xl border border-gray-200/60 bg-white p-5 hover:shadow-md hover:border-rose-300/60 transition-all duration-300">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center mb-3 shadow-sm">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-semibold mb-1 group-hover:text-rose-700 transition-colors">
              Profile
            </h3>
            <p className="text-sm text-muted-foreground">
              Update your major, interests, and academic info.
            </p>
          </div>
        </Link>
      </motion.div>

      {/* AI callout */}
      <motion.div variants={fadeIn}>
        <div className="relative overflow-hidden rounded-xl border border-red-200/60 bg-gradient-to-r from-white to-red-50/50 p-6">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-red-100/40 to-transparent rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="relative flex items-start gap-5">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-700 to-rose-600 flex items-center justify-center shrink-0 shadow-md shadow-red-800/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Powered by AI</h3>
              <p className="text-sm text-muted-foreground mb-4">
                MakeItSo uses Gemini to analyze Davidson&apos;s catalog, career data, and alumni patterns
                to give you recommendations you won&apos;t find anywhere else.
              </p>
              <div className="flex gap-3">
                <Button size="sm" className="bg-gradient-to-r from-red-700 to-rose-600 hover:from-red-800 hover:to-rose-700 shadow-sm" asChild>
                  <Link href="/explore">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    Explore Courses
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/career">Browse Careers</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
