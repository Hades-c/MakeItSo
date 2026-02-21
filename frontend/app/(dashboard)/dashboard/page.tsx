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
  Users,
  Zap,
} from "lucide-react";
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
      className="max-w-5xl mx-auto flex flex-col min-h-[calc(100vh-10rem)]"
      initial="initial"
      animate="animate"
      variants={stagger}
    >
      {/* Hero */}
      <motion.div variants={fadeIn} className="mb-6">
        <p className="text-sm text-gray-400 font-medium mb-1">{greeting}</p>
        <h1 className="text-3xl sm:text-4xl font-bold font-serif tracking-tight text-[#111111]">
          Welcome back, {firstName}
        </h1>
        <p className="text-[#555555] mt-1 max-w-lg">
          Your academic journey at Davidson, all in one place.
        </p>
      </motion.div>

      {/* Quick stats */}
      <motion.div variants={fadeIn} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Live Courses", value: "699", icon: BookOpen, color: "text-davidson", bg: "bg-davidson-light" },
          { label: "Career Paths", value: "16", icon: Briefcase, color: "text-davidson", bg: "bg-davidson-light" },
          { label: "AI Powered", value: "Gemini", icon: Zap, color: "text-davidson", bg: "bg-davidson-light" },
          { label: "Alumni Network", value: "30+", icon: Users, color: "text-davidson", bg: "bg-davidson-light" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all group">
            <div className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-bold font-serif tracking-tight text-[#111111]">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* Navigation cards - flex-1 to fill available space */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-2 gap-4 flex-1 mb-6">
        <Link href="/explore" className="group flex">
          <div className="rounded-xl border border-gray-100 bg-white p-7 hover:shadow-md hover:border-davidson/20 transition-all duration-200 flex-1 flex flex-col">
            <div className="h-12 w-12 rounded-xl bg-davidson-light flex items-center justify-center mb-4">
              <Compass className="h-6 w-6 text-davidson" />
            </div>
            <h3 className="font-semibold font-serif text-lg text-[#111111] mb-2 flex items-center gap-2">
              Explore Courses
              <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-davidson group-hover:translate-x-0.5 transition-all" />
            </h3>
            <p className="text-sm text-[#555555] leading-relaxed">
              Browse all 699 Davidson courses with live enrollment data, professor ratings, and AI insights.
            </p>
          </div>
        </Link>

        <Link href="/career" className="group flex">
          <div className="rounded-xl border border-gray-100 bg-white p-7 hover:shadow-md hover:border-davidson/20 transition-all duration-200 flex-1 flex flex-col">
            <div className="h-12 w-12 rounded-xl bg-davidson-light flex items-center justify-center mb-4">
              <Briefcase className="h-6 w-6 text-davidson" />
            </div>
            <h3 className="font-semibold font-serif text-lg text-[#111111] mb-2 flex items-center gap-2">
              Career Paths
              <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-davidson group-hover:translate-x-0.5 transition-all" />
            </h3>
            <p className="text-sm text-[#555555] leading-relaxed">
              Explore 16 career paths with alumni connections, AI roadmaps, and cold email generator.
            </p>
          </div>
        </Link>

        <Link href="/roadmap" className="group flex">
          <div className="rounded-xl border border-gray-100 bg-white p-7 hover:shadow-md hover:border-davidson/20 transition-all duration-200 flex-1 flex flex-col">
            <div className="h-12 w-12 rounded-xl bg-davidson-light flex items-center justify-center mb-4">
              <Map className="h-6 w-6 text-davidson" />
            </div>
            <h3 className="font-semibold font-serif text-lg text-[#111111] mb-2 flex items-center gap-2">
              AI Roadmap
              <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-davidson group-hover:translate-x-0.5 transition-all" />
            </h3>
            <p className="text-sm text-[#555555] leading-relaxed">
              Get a personalized semester-by-semester plan tailored to your major, interests, and career goals.
            </p>
          </div>
        </Link>

        <Link href="/courses" className="group flex">
          <div className="rounded-xl border border-gray-100 bg-white p-7 hover:shadow-md hover:border-davidson/20 transition-all duration-200 flex-1 flex flex-col">
            <div className="h-12 w-12 rounded-xl bg-davidson-light flex items-center justify-center mb-4">
              <GraduationCap className="h-6 w-6 text-davidson" />
            </div>
            <h3 className="font-semibold font-serif text-lg text-[#111111] mb-2 flex items-center gap-2">
              Course Plan
              <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-davidson group-hover:translate-x-0.5 transition-all" />
            </h3>
            <p className="text-sm text-[#555555] leading-relaxed">
              Track your 4-year degree progress, plan each semester, and stay on track for graduation.
            </p>
          </div>
        </Link>
      </motion.div>

      {/* AI banner - anchored to bottom */}
      <motion.div variants={fadeIn}>
        <div className="rounded-xl border border-davidson/10 bg-gradient-to-r from-davidson-light to-white p-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-davidson flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold font-serif text-sm text-[#111111]">Powered by Gemini AI</h3>
              <p className="text-xs text-[#555555]">
                Personalized recommendations, career roadmaps, and networking emails for your Davidson experience.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" className="bg-davidson hover:bg-davidson-dark text-white shadow-sm" asChild>
                <Link href="/explore">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Get Started
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

    </motion.div>
  );
}
