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
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { ActivitiesCarousel } from "@/components/activities-carousel";

const fadeIn = {
  initial: { opacity: 0, y: 16 },
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
      className="max-w-5xl mx-auto space-y-8"
      initial="initial"
      animate="animate"
      variants={stagger}
    >
      {/* Hero */}
      <motion.div variants={fadeIn}>
        <p className="text-sm text-gray-400 font-medium mb-1">{greeting}</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
          Welcome back, {firstName}
        </h1>
        <p className="text-gray-500 mt-1 max-w-lg">
          Your academic journey at Davidson, all in one place.
        </p>
      </motion.div>

      {/* Quick stats */}
      <motion.div variants={fadeIn} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Live Courses", value: "699", icon: BookOpen, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Career Paths", value: "16", icon: Briefcase, color: "text-rose-600", bg: "bg-rose-50" },
          { label: "AI Powered", value: "Gemini", icon: Zap, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Alumni Network", value: "30+", icon: Users, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all group">
            <div className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-bold tracking-tight text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* Primary CTAs */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-2 gap-4">
        <Link href="/explore" className="group">
          <div className="h-full rounded-xl border border-gray-100 bg-white p-6 hover:shadow-md hover:border-emerald-200 transition-all duration-200 overflow-hidden relative">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                <Compass className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  Explore Courses
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-sm text-gray-500">
                  Browse all 699 Davidson courses with live enrollment data, professor ratings, and AI insights.
                </p>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/career" className="group">
          <div className="h-full rounded-xl border border-gray-100 bg-white p-6 hover:shadow-md hover:border-rose-200 transition-all duration-200 overflow-hidden relative">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-rose-50 flex items-center justify-center shrink-0 group-hover:bg-rose-100 transition-colors">
                <Briefcase className="h-5 w-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  Career Paths
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-rose-500 group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-sm text-gray-500">
                  Explore 16 career paths with alumni connections, AI roadmaps, and cold email generator.
                </p>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Secondary features */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-3 gap-3">
        {[
          { href: "/roadmap", icon: Map, label: "AI Roadmap", desc: "Personalized semester plan for your major", color: "blue" },
          { href: "/courses", icon: GraduationCap, label: "Course Plan", desc: "Track your 4-year degree progress", color: "amber" },
          { href: "/profile", icon: TrendingUp, label: "Profile", desc: "Set your major, minor, and interests", color: "purple" },
        ].map(({ href, icon: Icon, label, desc, color }) => (
          <Link key={href} href={href} className="group">
            <div className="h-full rounded-xl border border-gray-100 bg-white p-5 hover:shadow-sm hover:border-gray-200 transition-all duration-200">
              <div className={`h-9 w-9 rounded-lg bg-${color}-50 flex items-center justify-center mb-3 group-hover:bg-${color}-100 transition-colors`}>
                <Icon className={`h-4 w-4 text-${color}-600`} />
              </div>
              <h3 className="font-medium text-sm text-gray-900 mb-0.5">{label}</h3>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
          </Link>
        ))}
      </motion.div>

      {/* AI banner */}
      <motion.div variants={fadeIn}>
        <div className="rounded-xl border border-rose-100 bg-gradient-to-r from-rose-50/50 to-white p-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">Powered by Gemini AI</h3>
              <p className="text-sm text-gray-500 mb-4">
                Get personalized course recommendations, career roadmaps, and networking emails — all tailored to your Davidson experience.
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white shadow-sm" asChild>
                  <Link href="/explore">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Get Started
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="text-gray-600" asChild>
                  <Link href="/career">Browse Careers</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Activities carousel */}
      <motion.div variants={fadeIn}>
        <ActivitiesCarousel />
      </motion.div>
    </motion.div>
  );
}
